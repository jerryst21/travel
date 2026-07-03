// File: api/list-reminders.js
import { createClient } from '@supabase/supabase-js';

// Inisialisasi Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Hanya menerima metode GET untuk membaca data
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // 1. Ambil SEMUA data yang statusnya 'pending' (Urutkan dari jadwal terlama ke terbaru)
    const { data: pendingData, error: errorPending } = await supabase
      .from('reminders')
      .select('id, scheduled_time, msg_header, message, phone_number, recipient, status')
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: true });

    if (errorPending) throw errorPending;

    // 2. Ambil maksimal 20 data terakhir yang statusnya 'sent' (Urutkan dari yang baru saja terkirim)
    const { data: sentData, error: errorSent } = await supabase
      .from('reminders')
      .select('id, scheduled_time, msg_header, message, phone_number, recipient, status, date_sent')
      .eq('status', 'sent')
      .order('date_sent', { ascending: false })
      .limit(20);

    if (errorSent) throw errorSent;

    // Response sukses mengembalikan dua kelompok data
    return res.status(200).json({
      success: true,
      pending: pendingData,
      sent: sentData
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Gagal mengambil daftar pengingat", 
      details: error.message 
    });
  }
}
