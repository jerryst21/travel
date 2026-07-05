// File: api/whappfly83.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  
  // -------------------------------------------------------------------------
  // [OPERASI 1] METHOD POST: Menyimpan Pengingat Baru ke Tabel Baru
  // -------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const { scheduled_time, msg_header, message, phone_number, recipient, status } = req.body;

      const { data, error } = await supabase
        .from('wappfly1983reminders') // Konsisten menggunakan tabel baru
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

        // 1. Ambil data antrean pending yang jatuh tempo dari tabel baru
        const { data, error } = await supabase
          .from('wappfly1983reminders')
          .select('id, phone_number, message, msg_header, scheduled_time, status')
          .eq('status', 'pending')
          .lte('scheduled_time', waktuSesuaiTampilan)
          .order('scheduled_time', { ascending: true })
          .limit(5);

        if (error) throw error;

        // 2. Hitung total sisa antrean aktif di database baru
        const { count: totalPendingDatabase } = await supabase
          .from('wappfly1983reminders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

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

            const templatePesan = `[INFO] Pengingat Otomatis\nWaktu : ${waktuFormatted}\nPerihal: ${reminder.msg_header || '-'}\nPesan :\n${reminder.message}`;

            const whappflyResponse = await fetch('https://wappfly.com/api/messages/send', {
              method: 'POST',
              headers: {
                'X-API-Token': process.env.WHAPPFLY_API_KEY, // Header harus 'X-API-Token' (sesuaikan kapitalisasi)
                'Content-Type': 'application/json; charset=utf-8'
              },
              body: JSON.stringify({ 
                to: reminder.phone_number + '@s.whatsapp.net', // Harus menyertakan format @s.whatsapp.net
                text: templatePesan // Harus menggunakan key 'text' sesuai dokumentasi
              })
            });

            const statusBaru = whappflyResponse.ok ? 'sent' : 'failed';
            
            await supabase
              .from('wappfly1983reminders')
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
          message: "Pengecekan Selesai (Whappfly Engine Active)",
          waktu_sekarang_manado: waktuTampilanManado,
          total_antrean_pending: totalPendingDatabase || 0,
          total_siap_kirim: data.length,
          detail_proses: hasilProses
        });

      } catch (error) {
        return res.status(500).json({ error: "Eksekusi cron gagal", details: error.message });
      }
    }

    // --- SUB-AKSI B: DASHBOARD LIST & KONEKSI (Default) ---
    const { grup } = req.query; // Menangkap parameter grup dari frontend
    try {
      let queryPending = supabase
        .from('wappfly1983reminders')
        .select('id, scheduled_time, msg_header, message, phone_number, recipient, status, grup')
        .eq('status', 'pending');
      
      let querySent = supabase
        .from('wappfly1983reminders')
        .select('id, scheduled_time, msg_header, message, phone_number, recipient, status, date_sent, grup')
        .eq('status', 'sent')
        .limit(20);
      
      // Logika Hak Akses: Jika BUKAN 'jay', lakukan filter berdasarkan parameter grup
      if (grup !== 'jay') {
        queryPending = queryPending.eq('grup', grup || '');
        querySent = querySent.eq('grup', grup || '');
      }
      
      // Eksekusi query setelah filter diterapkan
      const { data: pendingData, error: errorPending } = await queryPending.order('scheduled_time', { ascending: true });
      if (errorPending) throw errorPending;
      
      const { data: sentData, error: errorSent } = await querySent.order('date_sent', { ascending: false });
      if (errorSent) throw errorSent;

      return res.status(200).json({
        success: true,
        grup_terdeteksi: grup || 'tidak ada', // Validasi dasar Fase 1
        pending: pendingData,
        sent: sentData,
        total_antrean_pending: pendingData.length
      });

    } catch (error) {
      return res.status(500).json({ error: "Gagal mengambil daftar pengingat", details: error.message });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
