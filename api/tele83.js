// File: api/tele83.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  
  // [OPERASI 1] METHOD POST: Menyimpan Pengingat Telegram Baru
  if (req.method === 'POST') {
    try {
      const { scheduled_time, msg_header, message, chat_id, recipient, status, grup } = req.body;
      
      // UPDATE: Ubah penanda offset +00 dari frontend menjadi +08:00 (WITA asli) agar tercatat rapi di Supabase
      const adjustedTime = scheduled_time ? scheduled_time.replace('+00', '+08:00') : scheduled_time;
      
      const { data, error } = await supabase
        .from('telereminders') 
        .insert([{ 
          scheduled_time: adjustedTime, // Menggunakan waktu dengan zona WITA yang benar
          msg_header, 
          message, 
          chat_id, 
          recipient, 
          status: status || 'pending',
          grup: grup || '' 
        }])
        .select('id, msg_header, status');

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: "Pengingat Telegram berhasil disimpan!",
        data_tercatat: data[0]
      });
    } catch (error) {
      return res.status(500).json({ error: "Gagal menyimpan ke database", details: error.message });
    }
  }

  // [OPERASI 2] METHOD GET: Ambil Data Antrean & Riwayat Dashboard
  if (req.method === 'GET') {
    const { action, secret, grup } = req.query;

    // =========================================================================
    // BARIS UPDATE: SUB-AKSI CRON JOB EKSEKUSI OTOMATIS (?action=cron&secret=...)
    // =========================================================================
    if (action === 'cron') {
      if (secret !== process.env.MY_CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized access" });
      }

      try {
        const now = new Date();
        // UPDATE: Gunakan komparasi standar ISO UTC murni untuk memproses antrean jatuh tempo
        const waktuIsotoCompare = now.toISOString(); 
        const waktuTampilanManado = now.toLocaleString("id-ID", { timeZone: "Asia/Makassar" });

        // 1. Ambil data antrean pending yang jatuh tempo dari tabel telereminders
        const { data, error } = await supabase
          .from('telereminders')
          .select('id, chat_id, message, msg_header, scheduled_time, status')
          .eq('status', 'pending')
          .lte('scheduled_time', waktuIsotoCompare) // Query pencocokan waktu UTC yang aman & presisi
          .order('scheduled_time', { ascending: true })
          .limit(5);

        if (error) throw error;

        // 2. Hitung total sisa antrean aktif di database telereminders
        const { count: totalPendingDatabase } = await supabase
          .from('telereminders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        const hasilProses = [];
        const botToken = process.env.TELE_BOT_TOKEN;

        for (const reminder of data) {
          try {
            const d = new Date(reminder.scheduled_time);
            // UPDATE: Set zona waktu format teks kiriman Telegram ke Asia/Makassar (WITA)
            const weekday = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'Asia/Makassar' });
            const day = d.toLocaleString('en-US', { day: '2-digit', timeZone: 'Asia/Makassar' });
            const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Makassar' });
            const year = d.toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Makassar' });
            const time = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Makassar' });
            const waktuFormatted = `${weekday}, ${day} ${month} ${year} ${time}`;

            // Template pengingat otomatis rapi menggunakan Markdown style Telegram
            const templatePesan = `📢 *[PENGINGAT OTOMATIS]*\n*Waktu* : ${waktuFormatted} WITA\n*Perihal*:\n${reminder.msg_header || '-'}\n\n*Pesan* :\n${reminder.message}`;

            // Eksekusi pengiriman data menuju Telegram Bot API endpoint
            const teleResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: reminder.chat_id,
                text: templatePesan,
                parse_mode: 'Markdown'
              })
            });

            const resJson = await teleResponse.json();
            const statusBaru = (teleResponse.ok && resJson.ok) ? 'sent' : 'failed';
            
            // Update status log antrean di database Supabase
            await supabase
              .from('telereminders')
              .update({ 
                status: statusBaru,
                date_sent: statusBaru === 'sent' ? now.toISOString() : null // UPDATE: Simpan waktu kirim real-time ISO UTC
              })
              .eq('id', reminder.id);

            hasilProses.push({ id: reminder.id, status: statusBaru, telegram_status_ok: resJson.ok });
          } catch (err) {
            hasilProses.push({ id: reminder.id, status: 'error', error: err.message });
          }
        }

        return res.status(200).json({
          message: "Pengecekan Selesai (Telegram Engine Active)",
          waktu_sekarang_manado: waktuTampilanManado,
          total_antrean_pending: totalPendingDatabase || 0,
          total_siap_kirim: data.length,
          detail_proses: hasilProses
        });

      } catch (error) {
        return res.status(500).json({ error: "Eksekusi cron telegram gagal", details: error.message });
      }
    }

    try {
      let queryPending = supabase
        .from('telereminders')
        .select('id, scheduled_time, msg_header, message, chat_id, recipient, status, grup')
        .eq('status', 'pending');
    
      let querySent = supabase
        .from('telereminders')
        .select('id, scheduled_time, msg_header, message, chat_id, recipient, status, date_sent, grup')
        .eq('status', 'sent');
    
      if (grup !== 'jay') {
        queryPending = queryPending.eq('grup', grup || '');
        querySent = querySent.eq('grup', grup || '');
      }
    
      const { data: pendingData, error: errorPending } = await queryPending.order('scheduled_time', { ascending: true });
      if (errorPending) throw errorPending;
    
      const { data: sentData, error: errorSent } = await querySent.order('date_sent', { ascending: false }).limit(20);
      if (errorSent) throw errorSent;

      const { data: sentData, error: errorSent } = await querySent.order('date_sent', { ascending: false }).limit(20);
      if (errorSent) throw errorSent;

      // UPDATE: Transformasi balikan waktu dari DB (UTC) menjadi teks WITA literal (+00:00) agar dibaca 100% akurat oleh frontend lama
      const keTeksWitaLiteral = (isoStr) => {
        if (!isoStr) return null;
        const dateObj = new Date(isoStr);
        return dateObj.toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).replace(" ", "T") + "+00:00";
      };

      const formattedPending = pendingData.map(item => ({
        ...item,
        scheduled_time: keTeksWitaLiteral(item.scheduled_time)
      }));

      const formattedSent = sentData.map(item => ({
        ...item,
        scheduled_time: keTeksWitaLiteral(item.scheduled_time),
        date_sent: keTeksWitaLiteral(item.date_sent)
      }));

      return res.status(200).json({
        success: true,
        grup_terdeteksi: grup || 'tidak ada',
        pending: formattedPending, // Menggunakan data terformat
        sent: formattedSent,       // Menggunakan data terformat
        total_antrean_pending: pendingData.length
      });

    } catch (error) {
      return res.status(500).json({ error: "Gagal mengambil daftar pengingat", details: error.message });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
