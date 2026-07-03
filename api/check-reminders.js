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
    // 1. Ambil waktu sekarang langsung dalam format lokal WITA (Manado)
    const now = new Date();
    const currentTimeUTC = now.toISOString();
    const currentTimeWITA = now.toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).replace(" ", "T") + "+08:00";
    const waktuTampilanManado = now.toLocaleString("id-ID", { timeZone: "Asia/Makassar" });

    // Menghasilkan teks jam Manado tapi diberi label "+00:00" agar cocok dengan teks di Supabase
    const waktuSesuaiTampilan = now.toLocaleString("sv-SE", { timeZone: "Asia/Makassar" }).replace(" ", "T") + "+00:00";

    // 2. DEBUG BACA: Ketahui apakah RLS memblokir skrip kita
    const { data: cekAksesTabel, error: errorAkses } = await supabase
      .from('reminders')
      .select('id, status')
      .limit(3);

    // 3. QUERY UTAMA: Cari data pending yang waktunya <= waktu WITA sekarang
    const { data, error } = await supabase
      .from('reminders')
      .select('id, phone_number, message, msg_header, scheduled_time, status')
      .eq('status', 'pending')
      .lte('scheduled_time', waktuSesuaiTampilan)
      .order('scheduled_time', { ascending: true })
      .limit(5);

    // 3b. HITUNG TOTAL PENDING GLOBAL: Menghitung semua data antrean yang tersisa
    const { count: totalPendingDatabase } = await supabase
      .from('reminders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) throw error;

    // 4. PROSES KIRIM WHAPI & UPDATE STATUS (CRUD)
    const hasilProses = [];
    for (const reminder of data) {
      try {
        // --- TAMBAHKAN PROSES FORMATTING WAKTU DI SINI ---
        const d = new Date(reminder.scheduled_time);
        const weekday = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const day = d.toLocaleString('en-US', { day: '2-digit', timeZone: 'UTC' });
        const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = d.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
        const time = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
        const waktuFormatted = `${weekday}, ${day} ${month} ${year} ${time}`;

        // SUSUN TEMPLATE PESAN BARU
        const templatePesan = `📢 ini adalah pengingat otomatis\nWaktu : ${waktuFormatted}\nPerihal: ${reminder.msg_header || '-'}\nPesan :\n${reminder.message}`;
        // ------------------------------------------------

        const whapiResponse = await fetch('https://gate.whapi.cloud/messages/text', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: reminder.phone_number,
            body: templatePesan // <-- UBAH DARI reminder.message MENJADI templatePesan
          })
        });

        const statusBaru = whapiResponse.ok ? 'sent' : 'failed';
        
        await supabase
          .from('reminders')
          .update({ 
            status: statusBaru,
            date_sent: statusBaru === 'sent' ? waktuSesuaiTampilan : null // Menggunakan jam tampilan Manado
          })
          .eq('id', reminder.id);

        hasilProses.push({ id: reminder.id, status: statusBaru });

      } catch (err) {
        hasilProses.push({ id: reminder.id, status: 'error', error: err.message });
      }
    }

    // Response Akhir dengan info Transparan Waktu Manado & Debug RLS
    return res.status(200).json({
      message: "Pengecekan Selesai",
      waktu_sekarang_manado: waktuTampilanManado,
      status_internal_database: {
        pesan_error: errorAkses ? errorAkses.message : "Tidak ada",
        jumlah_data_terbaca: cekAksesTabel ? cekAksesTabel.length : 0,
        keterangan: (cekAksesTabel && cekAksesTabel.length === 0) ? "RLS Memblokir / Token Salah sehingga data terbaca 0" : "Koneksi Aman"
      },
      total_antrean_pending: totalPendingDatabase || 0, // <-- LINE BARU: Menampilkan semua sisa antrean
      total_siap_kirim: data.length,
      detail_proses: hasilProses
    });

  } catch (error) {
    return res.status(500).json({ 
      error: "Koneksi Gagal atau Error", 
      details: error.message 
    });
  }
}
