import { createClient } from '@supabase/supabase-js';

// Initialization Supabase Client menggunakan Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // KEAMANAN: Validasi secret token dari query parameter (?secret=...)
  const cronSecret = req.query.secret;
  if (cronSecret !== process.env.MY_CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  try {
    // Fase 2: Ambil semua properti data & filter berdasarkan waktu sekarang
    const currentTime = new Date().toISOString();

    const { data, error } = await supabase
      .from('reminders')
      .select('id, phone_number, message, scheduled_time, status')
      .eq('status', 'pending')
      .lte('scheduled_time', currentTime) // Mengambil yang scheduled_time <= waktu sekarang
      .limit(10); // Batasi 10 data per menit agar tidak overload

    if (error) throw error;

    // Response untuk memvalidasi data yang siap kirim
    return res.status(200).json({
      message: "Validasi Fase 2 Sukses!",
      waktu_pengecekan: currentTime,
      total_siap_kirim: data.length,
      data_siap_kirim: data
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Koneksi Gagal atau Error", 
      details: error.message 
    });
  }
}
