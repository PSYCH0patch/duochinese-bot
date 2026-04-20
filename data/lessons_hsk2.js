const lessonsHsk2 = [
  // Unit 9: Transportasi & Arah
  { id: 29, unit: 9, nama: 'Transportasi', deskripsi: 'Belajar nama kendaraan', wordIds: [151,152,153,154,155], isBoss: false },
  { id: 30, unit: 9, nama: 'Arah', deskripsi: 'Kiri, kanan, depan, belakang', wordIds: [156,157,158,159,160], isBoss: false },
  { id: 31, unit: 9, nama: 'Perjalanan', deskripsi: 'Kata kerja perjalanan', wordIds: [161,162,163,164,165], isBoss: false },
  { id: 32, unit: 9, nama: '🏆 Boss Unit 9', deskripsi: 'Tes semua kata Unit 9!', wordIds: [151,152,153,154,155,156,157,158,159,160,161,162,163,164,165], isBoss: true },
  // Unit 10: Belanja & Uang
  { id: 33, unit: 10, nama: 'Belanja', deskripsi: 'Beli, jual, mahal, murah', wordIds: [166,167,168,169,170], isBoss: false },
  { id: 34, unit: 10, nama: 'Uang', deskripsi: 'Uang, yuan, memberi', wordIds: [171,172,173,174,175], isBoss: false },
  { id: 35, unit: 10, nama: 'Pakaian', deskripsi: 'Baju, baru, lama', wordIds: [176,177,178,179,180], isBoss: false },
  { id: 36, unit: 10, nama: '🏆 Boss Unit 10', deskripsi: 'Tes semua kata Unit 10!', wordIds: [166,167,168,169,170,171,172,173,174,175,176,177,178,179,180], isBoss: true },
  // Unit 11: Kesehatan & Perasaan
  { id: 37, unit: 11, nama: 'Tubuh 2', deskripsi: 'Kepala, perut, kaki', wordIds: [181,182,183,184,185], isBoss: false },
  { id: 38, unit: 11, nama: 'Perasaan', deskripsi: 'Senang, marah, sedih, takut', wordIds: [186,187,188,189,190], isBoss: false },
  { id: 39, unit: 11, nama: 'Kesehatan', deskripsi: 'RS, dokter, sakit, istirahat', wordIds: [191,192,193,194,195], isBoss: false },
  { id: 40, unit: 11, nama: '🏆 Boss Unit 11', deskripsi: 'Tes semua kata Unit 11!', wordIds: [181,182,183,184,185,186,187,188,189,190,191,192,193,194,195], isBoss: true },
  // Unit 12: Pekerjaan & Sekolah
  { id: 41, unit: 12, nama: 'Sekolah', deskripsi: 'Sekolah, guru, murid, ujian', wordIds: [196,197,198,199,200], isBoss: false },
  { id: 42, unit: 12, nama: 'Pekerjaan', deskripsi: 'Kerja, perusahaan, sibuk', wordIds: [201,202,203,204,205], isBoss: false },
  { id: 43, unit: 12, nama: 'Komunikasi', deskripsi: 'Bicara, tahu, mengerti', wordIds: [206,207,208,209,210], isBoss: false },
  { id: 44, unit: 12, nama: '🏆 Boss Unit 12', deskripsi: 'Tes semua kata Unit 12!', wordIds: [196,197,198,199,200,201,202,203,204,205,206,207,208,209,210], isBoss: true },
  // Unit 13: Alam & Lingkungan
  { id: 45, unit: 13, nama: 'Alam', deskripsi: 'Gunung, sungai, bunga, pohon', wordIds: [211,212,213,214,215], isBoss: false },
  { id: 46, unit: 13, nama: 'Musim', deskripsi: 'Empat musim & angin', wordIds: [216,217,218,219,220], isBoss: false },
  { id: 47, unit: 13, nama: 'Hewan', deskripsi: 'Kucing, anjing, burung, kuda', wordIds: [221,222,223,224,225], isBoss: false },
  { id: 48, unit: 13, nama: '🏆 Boss Unit 13', deskripsi: 'Tes semua kata Unit 13!', wordIds: [211,212,213,214,215,216,217,218,219,220,221,222,223,224,225], isBoss: true },
  // Unit 14: Teknologi & Kehidupan Modern
  { id: 49, unit: 14, nama: 'Teknologi', deskripsi: 'Komputer, HP, TV', wordIds: [226,227,228,229,230], isBoss: false },
  { id: 50, unit: 14, nama: 'Media', deskripsi: 'Foto, musik, film', wordIds: [231,232,233,234,235], isBoss: false },
  { id: 51, unit: 14, nama: 'Hobi 2', deskripsi: 'Gambar, tari, olahraga', wordIds: [236,237,238,239,240], isBoss: false },
  { id: 52, unit: 14, nama: '🏆 Boss Unit 14', deskripsi: 'Tes semua kata Unit 14!', wordIds: [226,227,228,229,230,231,232,233,234,235,236,237,238,239,240], isBoss: true },
  // Unit 15: Hubungan Sosial
  { id: 53, unit: 15, nama: 'Hubungan', deskripsi: 'Teman, laki-laki, perempuan', wordIds: [241,242,243,244,245], isBoss: false },
  { id: 54, unit: 15, nama: 'Undangan & Acara', deskripsi: 'Ulang tahun, bermain, bersama', wordIds: [246,247,248,249,250], isBoss: false },
  { id: 55, unit: 15, nama: 'Sopan Santun', deskripsi: 'Tolong, terima kasih, maaf', wordIds: [251,252,253,254,255], isBoss: false },
  { id: 56, unit: 15, nama: '🏆 Boss Unit 15', deskripsi: 'Tes semua kata Unit 15!', wordIds: [241,242,243,244,245,246,247,248,249,250,251,252,253,254,255], isBoss: true },
  // Unit 16: Kehidupan Sehari-hari
  { id: 57, unit: 16, nama: 'Rutinitas', deskripsi: 'Bangun, tidur, pagi, malam', wordIds: [256,257,258,259,260,261,262,263,264,265], isBoss: false },
  { id: 58, unit: 16, nama: 'Makanan 2', deskripsi: 'Telur, susu, mie, buah, sayur', wordIds: [266,267,268,269,270,271,272,273,274,275,276,277,278], isBoss: false },
  { id: 59, unit: 16, nama: 'Rumah 2', deskripsi: 'Pintu, jendela, meja, kursi', wordIds: [279,280,281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300], isBoss: false },
  { id: 60, unit: 16, nama: '🏆 Final Boss HSK 2!', deskripsi: 'Tes SEMUA kata HSK 2!', wordIds: [151,166,181,196,211,226,241,256,266,279,155,170,185,200,215,240,255,270,290,300], isBoss: true },
];

module.exports = { lessonsHsk2 };
