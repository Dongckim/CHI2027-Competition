// Where this page runs, for keeping Arcs on the phone (user 11/25: they were gone after a day). Pure (tests).
// inApp: a messenger's or social app's own browser (KakaoTalk, Instagram, Facebook, LINE, NAVER, Daum…): its storage
//   is its own and short-lived, so Arcs made there do not reach Safari or Chrome and may be wiped.
// homeScreen: an iPhone or iPad Safari tab, not yet added to the Home Screen: Safari clears a site's data after 7 days
//   without a visit, but not a Home Screen app's.
const IN_APP = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|Twitter|; wv\)/i;
/** @param {string} ua @param {boolean} standalone the page runs as a Home Screen app */
export function keepAdvice(ua, standalone) {
  if (IN_APP.test(ua)) return 'inApp';
  if (/iPhone|iPad|iPod/.test(ua) && !standalone && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) return 'homeScreen';
  return null;
}
