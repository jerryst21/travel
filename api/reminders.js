// File: api/reminders.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  
  // -------------------------------------------------------------------------
  // [OPERASI 1] METHOD POST: Menyimpan Pengingat Baru (Berasal dari Form)
  // -------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const { scheduled_time, msg_header, message, phone_number, recipient, status } = req.body;

      const { data, error } = await supabase
        .from('reminders')
        .insert([{ 
          scheduled_time, 
          msg_header, 
          message, 
          phone_number, 
          recipient, 
          status: status || 'pending' 
        }])
        .select('id, msg_header, status');

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: "Data berhasil disimpan!",
        data_tercatat: data[0]
      });
    } catch (error) {
      return res.status(500).json({ error: "Gagal menyimpan ke database", details: error.message });
    }
  }

  // -------------------------------------------------------------------------
  // [OPERASI 2] METHOD GET: Dibagi Berdasarkan Parameter '?action=...'
  // -------------------------------------------------------------------------
  if (req.method === 'GET') {
    const { action, secret } = req.query;

    // --- SUB-AKSI A: CRON JOB EKSEKUSI OTOMATIS (?action=cron) ---
    if (action === 'cron') {
      if (secret !== process.env.MY_CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized access" });
      }

      try {
        const now = new Date();
        const waktuSesuaiTampilan = now.toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).replace(" ", "T") + "+00:00";
        const waktuTampilanManado = now.toLocaleString("id-ID", { timeZone: "Asia/Makassar" });

        // Ambil data antrean pending yang jatuh tempo
        const { data, error } = await supabase
          .from('reminders')
          .select('id, phone_number, message, msg_header, scheduled_time, status')
          .eq('status', 'pending')
          .lte('scheduled_time', waktuSesuaiTampilan)
          .order('scheduled_time', { ascending: true })
          .limit(5);

        if (error) throw error;

        const hasilProses = [];
        for (const reminder of data) {
          try {
            const d = new Date(reminder.scheduled_time);
            const weekday = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
            const day = d.toLocaleString('en-US', { day: '2-digit', timeZone: 'UTC' });
            const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
            const year = d.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
            const time = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
            const waktuFormatted = `${weekday}, ${day} ${month} ${year} ${time}`;

            const { count: totalPendingDatabase } = await supabase
              .from('reminders')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'pending');

            const templatePesan = `📢 ini adalah pengingat otomatis\nWaktu : ${waktuFormatted}\nPerihal: ${reminder.msg_header || '-'}\nPesan :\n${reminder.message}`;

            const whapiResponse = await fetch('https://gate.whapi.cloud/messages/text', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ to: reminder.phone_number, body: templatePesan })
            });

            const statusBaru = whapiResponse.ok ? 'sent' : 'failed';
            
            await supabase
              .from('reminders')
              .update({ 
                status: statusBaru,
                date_sent: statusBaru === 'sent' ? waktuSesuaiTampilan : null
              })
              .eq('id', reminder.id);

            hasilProses.push({ id: reminder.id, status: statusBaru });
          } catch (err) {
            hasilProses.push({ id: reminder.id, status: 'error', error: err.message });
          }
        }

        return res.status(200).json({
          message: "Pengecekan Selesai",
          waktu_sekarang_manado: waktuTampilanManado,
          total_antrean_pending: totalPendingDatabase || 0, // <-- LINE BARU: Menampilkan semua sisa antrean
          total_siap_kirim: data.length,
          detail_proses: hasilProses
        });

      } catch (error) {
        return res.status(500).json({ error: "Eksekusi cron gagal", details: error.message });
      }
    }

    // --- SUB-AKSI B: DASHBOARD LIST & KONEKSI (Default / ?action=list) ---
    try {
      // 1. Ambil data pending
      const { data: pendingData, error: errorPending } = await supabase
        .from('reminders')
        .select('id, scheduled_time, msg_header, message, phone_number, recipient, status')
        .eq('status', 'pending')
        .order('scheduled_time', { ascending: true });

      if (errorPending) throw errorPending;

      // 2. Ambil 20 riwayat sent terakhir
      const { data: sentData, error: errorSent } = await supabase
        .from('reminders')
        .select('id, scheduled_time, msg_header, message, phone_number, recipient, status, date_sent')
        .eq('status', 'sent')
        .order('date_sent', { ascending: false })
        .limit(20);

      if (errorSent) throw errorSent;

      // Kembalikan semua data dashboard sekaligus beserta informasi total sisa antrean
      return res.status(200).json({
        success: true,
        pending: pendingData,
        sent: sentData,
        total_antrean_pending: pendingData.length // Menghemat kuota query dengan menghitung panjang array pending langsung
      });

    } catch (error) {
      return res.status(500).json({ error: "Gagal mengambil daftar pengingat", details: error.message });
    }
  }

  // Jika dipanggil di luar POST & GET
  return res.status(405).json({ error: "Method Not Allowed" });
}
