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
    // Fase 2 & 3: Ambil properti data, filter waktu, dan URUTKAN (Oldest First)
    const currentTime = new Date().toISOString();

    // DEBUG: Ambil 1 data pending terlama tanpa filter waktu untuk cek timezone
    const { data: cekWaktuDB } = await supabase
      .from('reminders')
      .select('scheduled_time')
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: true })
      .limit(1);
    
    const { data, error } = await supabase
      .from('reminders')
      .select('id, phone_number, message, scheduled_time, status')
      .eq('status', 'pending')
      .lte('scheduled_time', currentTime)
      .order('scheduled_time', { ascending: true }) // Fase 3: Antrean terlama diproses duluan
      .limit(5); // Batasi 5 pesan per menit agar aman dari rate limit

    if (error) throw error;

    // Fase 4: Aksi Kirim Whapi & Update Status ke Supabase
    const hasilProses = [];

    for (const reminder of data) {
      try {
        // 1. Kirim ke Whapi
        const whapiResponse = await fetch('https://gate.whapi.cloud/messages/text', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: reminder.phone_number,
            body: reminder.message
          })
        });

        // 2. Update status di Supabase berdasarkan hasil kirim Whapi
        const statusBaru = whapiResponse.ok ? 'sent' : 'failed';
        
        await supabase
          .from('reminders')
          .update({ status: statusBaru })
          .eq('id', reminder.id);

        hasilProses.push({ id: reminder.id, status: statusBaru });

      } catch (err) {
        hasilProses.push({ id: reminder.id, status: 'error', error: err.message });
      }
    }

    // Response Akhir dengan info Debug
    return res.status(200).json({
      message: "Proses reminder selesai",
      waktu_server_utc: currentTime,
      jadwal_database_terdekat: cekWaktuDB?.[0]?.scheduled_time || "Tidak ada data pending",
      total_diproses: data.length,
      detail_proses: hasilProses
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Koneksi Gagal atau Error", 
      details: error.message 
    });
  }
}
