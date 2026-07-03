import { createClient } from '@supabase/supabase-js';

// Initialization Supabase Client menggunakan Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    // Fase 1: Ambil properti data yang sangat sederhana dulu (id dan status)
    const { data, error } = await supabase
      .from('reminders')
      .select('id, status')
      .eq('status', 'pending')
      .limit(5);

    if (error) throw error;

    // Response sukses untuk validasi
    return res.status(200).json({
      message: "Koneksi Supabase Sukses!",
      total_pending: data.length,
      data_sampel: data
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Koneksi Gagal atau Error", 
      details: error.message 
    });
  }
}
