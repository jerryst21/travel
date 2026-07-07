// File: api/tele83.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // 1. Validasi keberadaan Token Telegram di Environment Variable
      const teleTokenExists = !!process.env.TELE_BOT_TOKEN;
      
      // 2. Test query dasar ke tabel baru 'telereminders' (ambil 1 data saja)
      const { data, error } = await supabase
        .from('telereminders')
        .select('id, status')
        .limit(1);

      if (error) throw error;

      // 3. Kembalikan response sukses sederhana jika tidak ada error database
      return res.status(200).json({
        success: true,
        message: "Fase 1 Berhasil: Koneksi Backend, Supabase, dan Telegram aman!",
        tele_bot_token_configured: teleTokenExists,
        database_status: "Terhubung (OK)",
        sample_data: data
      });
    } catch (error) {
      return res.status(500).json({ 
        success: false, 
        error: "Gagal validasi Fase 1", 
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
