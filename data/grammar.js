const grammar = [
  {
    id: 1,
    title: 'Pola: 我是... (Saya adalah...)',
    pattern: '主语 + 是 + 名词',
    explanation: '**是 (shì)** digunakan seperti kata "adalah" dalam bahasa Indonesia.\nDigunakan untuk menyatakan identitas atau profesi.',
    examples: [
      { cn: '我是学生。', py: 'Wǒ shì xuéshēng.', id: 'Saya adalah pelajar.' },
      { cn: '他是老师。', py: 'Tā shì lǎoshī.', id: 'Dia adalah guru.' },
      { cn: '她是医生。', py: 'Tā shì yīshēng.', id: 'Dia adalah dokter.' },
    ],
    tip: '💡 Untuk kalimat negatif gunakan **不是 (bù shì)**: 我不是学生 (Saya bukan pelajar)',
    unit: 1
  },
  {
    id: 2,
    title: 'Pola: 我叫... (Nama saya...)',
    pattern: '我 + 叫 + nama',
    explanation: '**叫 (jiào)** artinya "dipanggil/bernama".\nDigunakan untuk memperkenalkan nama diri.',
    examples: [
      { cn: '我叫小明。', py: 'Wǒ jiào Xiǎo Míng.', id: 'Nama saya Xiao Ming.' },
      { cn: '你叫什么名字？', py: 'Nǐ jiào shénme míngzi?', id: 'Siapa namamu?' },
    ],
    tip: '💡 Bisa juga pakai: 我的名字是... (Wǒ de míngzì shì...) = Nama saya adalah...',
    unit: 1
  },
  {
    id: 3,
    title: 'Pola: 很 (sangat)',
    pattern: '主语 + 很 + 形容词',
    explanation: '**很 (hěn)** artinya "sangat".\nDalam bahasa Mandarin, kata sifat biasanya perlu 很 di depannya.',
    examples: [
      { cn: '我很好。', py: 'Wǒ hěn hǎo.', id: 'Saya baik-baik saja.' },
      { cn: '今天很热。', py: 'Jīntiān hěn rè.', id: 'Hari ini sangat panas.' },
      { cn: '她很漂亮。', py: 'Tā hěn piàoliang.', id: 'Dia sangat cantik.' },
    ],
    tip: '💡 Berbeda dengan bahasa Indonesia, "我好" (tanpa 很) terdengar aneh kecuali menjawab pertanyaan.',
    unit: 2
  },
  {
    id: 4,
    title: 'Pola: 我有... (Saya punya...)',
    pattern: '主语 + 有 + 宾语',
    explanation: '**有 (yǒu)** artinya "punya" atau "ada".\nUntuk negatif gunakan **没有 (méi yǒu)**, BUKAN 不有.',
    examples: [
      { cn: '我有一本书。', py: 'Wǒ yǒu yī běn shū.', id: 'Saya punya satu buku.' },
      { cn: '他没有钱。', py: 'Tā méi yǒu qián.', id: 'Dia tidak punya uang.' },
      { cn: '这里有人吗？', py: 'Zhèlǐ yǒu rén ma?', id: 'Apakah ada orang di sini?' },
    ],
    tip: '💡 Ingat: negatif dari 有 adalah 没有, BUKAN 不有!',
    unit: 6
  },
  {
    id: 5,
    title: 'Pola: 在 (di/sedang)',
    pattern: '主语 + 在 + 地点 / 主语 + 在 + 动词',
    explanation: '**在 (zài)** punya 2 fungsi:\n1. Menyatakan lokasi: "di"\n2. Menyatakan sedang berlangsung: "sedang"',
    examples: [
      { cn: '我在学校。', py: 'Wǒ zài xuéxiào.', id: 'Saya di sekolah.' },
      { cn: '他在看书。', py: 'Tā zài kàn shū.', id: 'Dia sedang membaca buku.' },
      { cn: '你在哪里？', py: 'Nǐ zài nǎlǐ?', id: 'Kamu di mana?' },
    ],
    tip: '💡 Fungsi "sedang" mirip seperti -ing dalam bahasa Inggris.',
    unit: 6
  },
  {
    id: 6,
    title: 'Partikel 吗 (ma) — Kalimat Tanya',
    pattern: 'Kalimat + 吗？',
    explanation: '**吗 (ma)** adalah partikel untuk membuat kalimat tanya ya/tidak.\nCukup tambahkan 吗 di akhir kalimat.',
    examples: [
      { cn: '你好吗？', py: 'Nǐ hǎo ma?', id: 'Apa kabar?' },
      { cn: '你是学生吗？', py: 'Nǐ shì xuéshēng ma?', id: 'Apakah kamu pelajar?' },
      { cn: '你吃饭了吗？', py: 'Nǐ chī fàn le ma?', id: 'Kamu sudah makan?' },
    ],
    tip: '💡 Lebih mudah dari bahasa Indonesia! Tidak perlu mengubah urutan kata, cukup tambah 吗.',
    unit: 4
  },
  {
    id: 7,
    title: 'Partikel 了 (le) — Sudah Terjadi',
    pattern: '动词 + 了',
    explanation: '**了 (le)** menunjukkan bahwa suatu tindakan sudah selesai atau terjadi.',
    examples: [
      { cn: '我吃了。', py: 'Wǒ chī le.', id: 'Saya sudah makan.' },
      { cn: '他来了。', py: 'Tā lái le.', id: 'Dia sudah datang.' },
      { cn: '我明白了。', py: 'Wǒ míngbai le.', id: 'Saya sudah mengerti.' },
    ],
    tip: '💡 Bahasa Mandarin tidak punya konjugasi kata kerja seperti bahasa Inggris. 了 menggantikan fungsi past tense.',
    unit: 4
  },
  {
    id: 8,
    title: 'Struktur 因为...所以... (Karena...Jadi...)',
    pattern: '因为 + sebab + 所以 + akibat',
    explanation: '**因为 (yīnwèi)** = karena\n**所以 (suǒyǐ)** = jadi/oleh karena itu\nBiasanya dipakai berpasangan.',
    examples: [
      { cn: '因为下雨，所以我不去了。', py: 'Yīnwèi xià yǔ, suǒyǐ wǒ bù qù le.', id: 'Karena hujan, jadi saya tidak pergi.' },
      { cn: '因为他生病了，所以没来。', py: 'Yīnwèi tā shēngbìng le, suǒyǐ méi lái.', id: 'Karena dia sakit, jadi tidak datang.' },
    ],
    tip: '💡 Bisa dipakai salah satunya saja: "因为下雨，我不去了" juga benar.',
    unit: 6
  },
];
module.exports = grammar;
