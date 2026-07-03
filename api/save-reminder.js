// File: api/save-reminder.js
import { createClient } from '@supabase/supabase-js';

// Inisialisasi Supabase Client menggunakan Environment Variables yang sudah ada
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Hanya menerima metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // KEAMANAN: Validasi secret token dari query parameter (?secret=...)
  const cronSecret = req.query.secret;
  if (cronSecret !== process.env.MY_CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  try {
    // Mengambil data sederhana yang dikirim dari form input.html
    const { scheduled_time, msg_header, message, phone_number, recipient, status } = req.body;

    // FASE 1: Validasi koneksi tulis dengan langsung melakukan insert data dasar
    const { data, error } = await supabase
      .from('reminders')
      .insert([
        { 
          scheduled_time, 
          msg_header, 
          message, 
          phone_number, 
          recipient, 
          status: status || 'pending' 
        }
      ])
      .select('id, msg_header, status'); // Mengembalikan properti data sederhana setelah sukses

    if (error) throw error;

    // Response sukses Fase 1
    return res.status(200).json({
      success: true,
      message: "Koneksi tulis aman. Data berhasil disimpan!",
      data_tercatat: data[0]
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Gagal menyimpan ke database Supabase", 
      details: error.message 
    });
  }
}
