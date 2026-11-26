// Captured from the production web app (3dbf0169) at 402 × 786 CSS px.
// The example collection is built by scripts/readme-screenshots/sample_deck.py.
const screenshot = (file: string, alt: string) => ({
  src: `/images/uygulama/${file}.webp`,
  width: 804,
  height: 1572,
  alt,
});

export const heroDevicesImage = {
  src: '/images/uygulama/hero-telefon-pc.webp',
  width: 1600,
  height: 1074,
  alt: 'TusAnkiM telefon ve bilgisayar ekranları. Solda iPhone’da Desteler ekranı, sağda MacBook Pro’da Farmakoloji çalışma kartı ve FSRS tekrar düğmeleri.',
} as const;

export const appScreens = {
  decks: screenshot('desteler', 'Desteler ekranı. Temel ve Klinik Bilimler desteleri, yeni kart ve tekrar sayıları.'),
  answer: screenshot('kart-cevap', 'Çalışma ekranı. Farmakoloji kartının yanıtı ve tekrar aralıklarıyla birlikte Tekrar, Zor, İyi ve Kolay düğmeleri.'),
  question: screenshot('kart-soru', 'Çalışma ekranı. Farmakoloji sorusu, Cevabı göster düğmesi ve alt araç çubuğu.'),
  stopwatch: screenshot('kronometre', 'Kronometre ekranı. Günün çalışma süresi ve kronometreyi başlatma düğmesi.'),
  calendar: screenshot('takvim', 'Çalışma Takvimi ekranı. Aylık görünümde çalışma günleri ve seçili günün oturumları.'),
  fsrs: screenshot('fsrs', 'Deste seçeneklerinde FSRS zamanlayıcısı ve hedef hatırlama ayarı.'),
  import: screenshot('ice-aktar', 'İçe aktar ekranı. Örnek Anki paketindeki desteler ve içe aktarma günlüğü.'),
} as const;
