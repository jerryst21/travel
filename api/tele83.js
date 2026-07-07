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
      
      const { data, error } = await supabase
        .from('telereminders') 
        .insert([{ 
          scheduled_time, 
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

    // Proteksi sementara untuk sub-aksi cron (akan diisi penuh di Fase 3)
    if (action === 'cron') {
      return res.status(200).json({ message: "Engine Cron Telegram siap dikonfigurasi pada Fase 3." });
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

      return res.status(200).json({
        success: true,
        grup_terdeteksi: grup || 'tidak ada',
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
