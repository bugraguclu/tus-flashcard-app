import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuideSearch, guideSearchWords } from '../src/lib/guideSearch.ts';

const find = createGuideSearch([
  { type: 'Kılavuz', title: 'Kullanım ayarları', sub: '', url: '/yardim/ayarlar/', terms: 'yedek ayarları ve puan ekranı' },
  { type: 'Kılavuz', title: 'Yedekler', sub: '', url: '/yardim/yedekler/', terms: 'yedeğini geri yükle' },
  { type: 'Sayfa', title: 'TUS Puan Hesaplayıcı', sub: '', url: '/puan-hesapla/', terms: 'puan hesapla hedef net temel klinik' },
  { type: 'Kılavuz', title: 'TUS Paketi', sub: '', url: '/yardim/tus-kartlari/', terms: 'kartların bir bölümünü bul' },
]);

test('folds Turkish, case and punctuation without dropping abbreviations', () => {
  assert.deepEqual(guideSearchWords('YEDEĞİ, FSRS-6 ve .COLPKG'), ['yedegi', 'fsrs', '6', 've', 'colpkg']);
});

test('matches softened Turkish stems in either direction', () => {
  assert.equal(find('yedegi')[0]?.url, '/yardim/yedekler/');
  assert.equal(find('yedek geri yukle')[0]?.url, '/yardim/yedekler/');
  assert.deepEqual(find('yedegz'), []);
});

test('finds tools alongside guides, prioritizes title hits and requires each term', () => {
  assert.deepEqual(find('puan hesapla').map(({ url }) => url), ['/puan-hesapla/']);
  assert.equal(find('yedek')[0]?.url, '/yardim/yedekler/');
  assert.deepEqual(find('fsrs hesapla'), []);
  assert.deepEqual(find('...'), []);
});
