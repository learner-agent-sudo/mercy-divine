/* 每日福音：照羅馬禮的禮儀年曆，算出某一天彌撒所讀的福音出處。

   只算福音——本程式的經文只有四部福音和宗徒大事錄，福音每天都讀得到。
   跟香港教區的做法：主顯節移到 1 月 2 日至 8 日之間的主日，耶穌升天節移到
   復活期第七主日，基督聖體聖血節在主日。地方教會自己的日子（例如農曆新年）
   和只是選擇性的紀念日不在這裡，那些日子讀的是當天平日的福音。
   幾篇有長、短兩種讀法的，這裡用長的；聖誕節用天明後（日間）彌撒的福音。

   出處寫法：書卷（M 瑪竇、K 馬爾谷、L 路加、J 若望）、空一格、章:節。
   同一章的另一段用逗號，換章用分號：'M 6:1-6,16-18'、'L 1:1-4;4:14-21'、'M 26:14-27:66'。
   節號後的 a、b 是「上半節」「下半節」，經文照整節顯示，出處照原樣寫出。 */
(function () {
'use strict';

const BOOK = { M: 'mat', K: 'mrk', L: 'luk', J: 'jhn' };
const ABBR = { mat: '瑪', mrk: '谷', luk: '路', jhn: '若' };
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const cnNum = (n) => (n < 10 ? CN[n] : n < 20 ? `十${CN[n % 10]}` : `${CN[Math.floor(n / 10)]}十${CN[n % 10]}`);
const DOW = '日一二三四五六';

/* ── 讀經表 ─────────────────────────────────────── */
// 主日（甲、乙、丙年）
const SUNDAY = {
  advent: {
    A: ['M 24:37-44', 'M 3:1-12', 'M 11:2-11', 'M 1:18-24'],
    B: ['K 13:33-37', 'K 1:1-8', 'J 1:6-8,19-28', 'L 1:26-38'],
    C: ['L 21:25-28,34-36', 'L 3:1-6', 'L 3:10-18', 'L 1:39-45'],
  },
  lent: {
    A: ['M 4:1-11', 'M 17:1-9', 'J 4:5-42', 'J 9:1-41', 'J 11:1-45'],
    B: ['K 1:12-15', 'K 9:2-10', 'J 2:13-25', 'J 3:14-21', 'J 12:20-33'],
    C: ['L 4:1-13', 'L 9:28b-36', 'L 13:1-9', 'L 15:1-3,11-32', 'J 8:1-11'],
  },
  palm: { A: 'M 26:14-27:66', B: 'K 14:1-15:47', C: 'L 22:14-23:56' },
  vigil: { A: 'M 28:1-10', B: 'K 16:1-7', C: 'L 24:1-12' },
  // 復活期第二至第七主日
  easter: {
    A: ['J 20:19-31', 'L 24:13-35', 'J 10:1-10', 'J 14:1-12', 'J 14:15-21', 'J 17:1-11a'],
    B: ['J 20:19-31', 'L 24:35-48', 'J 10:11-18', 'J 15:1-8', 'J 15:9-17', 'J 17:11b-19'],
    C: ['J 20:19-31', 'J 21:1-19', 'J 10:27-30', 'J 13:31-33a,34-35', 'J 14:23-29', 'J 17:20-26'],
  },
  ascension: { A: 'M 28:16-20', B: 'K 16:15-20', C: 'L 24:46-53' },
  trinity: { A: 'J 3:16-18', B: 'M 28:16-20', C: 'J 16:12-15' },
  corpus: { A: 'J 6:51-58', B: 'K 14:12-16,22-26', C: 'L 9:11b-17' },
  heart: { A: 'M 11:25-30', B: 'J 19:31-37', C: 'L 15:3-7' },
  family: { A: 'M 2:13-15,19-23', B: 'L 2:22-40', C: 'L 2:41-52' },
  baptism: { A: 'M 3:13-17', B: 'K 1:7-11', C: 'L 3:15-16,21-22' },
  // 常年期第二至第三十四主日（第三十四主日是基督普世君王節）
  ordinary: {
    A: ['J 1:29-34', 'M 4:12-23', 'M 5:1-12a', 'M 5:13-16', 'M 5:17-37', 'M 5:38-48', 'M 6:24-34',
        'M 7:21-27', 'M 9:9-13', 'M 9:36-10:8', 'M 10:26-33', 'M 10:37-42', 'M 11:25-30', 'M 13:1-23',
        'M 13:24-43', 'M 13:44-52', 'M 14:13-21', 'M 14:22-33', 'M 15:21-28', 'M 16:13-20', 'M 16:21-27',
        'M 18:15-20', 'M 18:21-35', 'M 20:1-16a', 'M 21:28-32', 'M 21:33-43', 'M 22:1-14', 'M 22:15-21',
        'M 22:34-40', 'M 23:1-12', 'M 25:1-13', 'M 25:14-30', 'M 25:31-46'],
    B: ['J 1:35-42', 'K 1:14-20', 'K 1:21-28', 'K 1:29-39', 'K 1:40-45', 'K 2:1-12', 'K 2:18-22',
        'K 2:23-3:6', 'K 3:20-35', 'K 4:26-34', 'K 4:35-41', 'K 5:21-43', 'K 6:1-6', 'K 6:7-13',
        'K 6:30-34', 'J 6:1-15', 'J 6:24-35', 'J 6:41-51', 'J 6:51-58', 'J 6:60-69', 'K 7:1-8,14-15,21-23',
        'K 7:31-37', 'K 8:27-35', 'K 9:30-37', 'K 9:38-43,45,47-48', 'K 10:2-16', 'K 10:17-30',
        'K 10:35-45', 'K 10:46-52', 'K 12:28b-34', 'K 12:38-44', 'K 13:24-32', 'J 18:33b-37'],
    C: ['J 2:1-11', 'L 1:1-4;4:14-21', 'L 4:21-30', 'L 5:1-11', 'L 6:17,20-26', 'L 6:27-38', 'L 6:39-45',
        'L 7:1-10', 'L 7:11-17', 'L 7:36-8:3', 'L 9:18-24', 'L 9:51-62', 'L 10:1-12,17-20', 'L 10:25-37',
        'L 10:38-42', 'L 11:1-13', 'L 12:13-21', 'L 12:32-48', 'L 12:49-53', 'L 13:22-30', 'L 14:1,7-14',
        'L 14:25-33', 'L 15:1-32', 'L 16:1-13', 'L 16:19-31', 'L 17:5-10', 'L 17:11-19', 'L 18:1-8',
        'L 18:9-14', 'L 19:1-10', 'L 20:27-38', 'L 21:5-19', 'L 23:35-43'],
  },
};

// 平日：每一週星期一到星期六
const WEEKDAY = {
  advent: [
    ['M 8:5-11', 'L 10:21-24', 'M 15:29-37', 'M 7:21,24-27', 'M 9:27-31', 'M 9:35-10:1,5a,6-8'],
    ['L 5:17-26', 'M 18:12-14', 'M 11:28-30', 'M 11:11-15', 'M 11:16-19', 'M 17:9a,10-13'],
    ['M 21:23-27', 'M 21:28-32', 'L 7:18b-23', 'L 7:24-30', 'J 5:33-36'],
  ],
  // 12 月 17 日至 24 日依日期
  lateAdvent: ['M 1:1-17', 'M 1:18-25', 'L 1:5-25', 'L 1:26-38', 'L 1:39-45', 'L 1:46-56', 'L 1:57-66', 'L 1:67-79'],
  // 12 月 29 日至 31 日
  octave: { 29: 'L 2:22-35', 30: 'L 2:36-40', 31: 'J 1:1-18' },
  // 1 月 2 日至 7 日（主顯節之前）
  january: { 2: 'J 1:19-28', 3: 'J 1:29-34', 4: 'J 1:35-42', 5: 'J 1:43-51', 6: 'K 1:7-11', 7: 'J 2:1-11' },
  // 主顯節後的星期一至星期六
  epiphany: ['M 4:12-17,23-25', 'K 6:34-44', 'K 6:45-52', 'L 4:14-22a', 'L 5:12-16', 'J 3:22-30'],
  afterAsh: ['L 9:22-25', 'M 9:14-15', 'L 5:27-32'],   // 聖灰禮儀後星期四、五、六
  lent: [
    ['M 25:31-46', 'M 6:7-15', 'L 11:29-32', 'M 7:7-12', 'M 5:20-26', 'M 5:43-48'],
    ['L 6:36-38', 'M 23:1-12', 'M 20:17-28', 'L 16:19-31', 'M 21:33-43,45-46', 'L 15:1-3,11-32'],
    ['L 4:24-30', 'M 18:21-35', 'M 5:17-19', 'L 11:14-23', 'K 12:28-34', 'L 18:9-14'],
    ['J 4:43-54', 'J 5:1-16', 'J 5:17-30', 'J 5:31-47', 'J 7:1-2,10,25-30', 'J 7:40-53'],
    ['J 8:1-11', 'J 8:21-30', 'J 8:31-42', 'J 8:51-59', 'J 10:31-42', 'J 11:45-56'],
    ['J 12:1-11', 'J 13:21-33,36-38', 'M 26:14-25'],     // 聖週星期一至三
  ],
  // 復活節八日慶期，然後第二至第七週
  easter: [
    ['M 28:8-15', 'J 20:11-18', 'L 24:13-35', 'L 24:35-48', 'J 21:1-14', 'K 16:9-15'],
    ['J 3:1-8', 'J 3:7b-15', 'J 3:16-21', 'J 3:31-36', 'J 6:1-15', 'J 6:16-21'],
    ['J 6:22-29', 'J 6:30-35', 'J 6:35-40', 'J 6:44-51', 'J 6:52-59', 'J 6:60-69'],
    ['J 10:1-10', 'J 10:22-30', 'J 12:44-50', 'J 13:16-20', 'J 14:1-6', 'J 14:7-14'],
    ['J 14:21-26', 'J 14:27-31a', 'J 15:1-8', 'J 15:9-11', 'J 15:12-17', 'J 15:18-21'],
    ['J 15:26-16:4a', 'J 16:5-11', 'J 16:12-15', 'J 16:16-20', 'J 16:20-23', 'J 16:23b-28'],
    ['J 16:29-33', 'J 17:1-11a', 'J 17:11b-19', 'J 17:20-26', 'J 21:15-19', 'J 21:20-25'],
  ],
  // 常年期第一至第三十四週：馬爾谷（1–9）、瑪竇（10–21）、路加（22–34）
  ordinary: [
    ['K 1:14-20', 'K 1:21-28', 'K 1:29-39', 'K 1:40-45', 'K 2:1-12', 'K 2:13-17'],
    ['K 2:18-22', 'K 2:23-28', 'K 3:1-6', 'K 3:7-12', 'K 3:13-19', 'K 3:20-21'],
    ['K 3:22-30', 'K 3:31-35', 'K 4:1-20', 'K 4:21-25', 'K 4:26-34', 'K 4:35-41'],
    ['K 5:1-20', 'K 5:21-43', 'K 6:1-6', 'K 6:7-13', 'K 6:14-29', 'K 6:30-34'],
    ['K 6:53-56', 'K 7:1-13', 'K 7:14-23', 'K 7:24-30', 'K 7:31-37', 'K 8:1-10'],
    ['K 8:11-13', 'K 8:14-21', 'K 8:22-26', 'K 8:27-33', 'K 8:34-9:1', 'K 9:2-13'],
    ['K 9:14-29', 'K 9:30-37', 'K 9:38-40', 'K 9:41-50', 'K 10:1-12', 'K 10:13-16'],
    ['K 10:17-27', 'K 10:28-31', 'K 10:32-45', 'K 10:46-52', 'K 11:11-26', 'K 11:27-33'],
    ['K 12:1-12', 'K 12:13-17', 'K 12:18-27', 'K 12:28-34', 'K 12:35-37', 'K 12:38-44'],
    ['M 5:1-12', 'M 5:13-16', 'M 5:17-19', 'M 5:20-26', 'M 5:27-32', 'M 5:33-37'],
    ['M 5:38-42', 'M 5:43-48', 'M 6:1-6,16-18', 'M 6:7-15', 'M 6:19-23', 'M 6:24-34'],
    ['M 7:1-5', 'M 7:6,12-14', 'M 7:15-20', 'M 7:21-29', 'M 8:1-4', 'M 8:5-17'],
    ['M 8:18-22', 'M 8:23-27', 'M 8:28-34', 'M 9:1-8', 'M 9:9-13', 'M 9:14-17'],
    ['M 9:18-26', 'M 9:32-38', 'M 10:1-7', 'M 10:7-15', 'M 10:16-23', 'M 10:24-33'],
    ['M 10:34-11:1', 'M 11:20-24', 'M 11:25-27', 'M 11:28-30', 'M 12:1-8', 'M 12:14-21'],
    ['M 12:38-42', 'M 12:46-50', 'M 13:1-9', 'M 13:10-17', 'M 13:18-23', 'M 13:24-30'],
    ['M 13:31-35', 'M 13:36-43', 'M 13:44-46', 'M 13:47-53', 'M 13:54-58', 'M 14:1-12'],
    ['M 14:13-21', 'M 14:22-36', 'M 15:21-28', 'M 16:13-23', 'M 16:24-28', 'M 17:14-20'],
    ['M 17:22-27', 'M 18:1-5,10,12-14', 'M 18:15-20', 'M 18:21-19:1', 'M 19:3-12', 'M 19:13-15'],
    ['M 19:16-22', 'M 19:23-30', 'M 20:1-16', 'M 22:1-14', 'M 22:34-40', 'M 23:1-12'],
    ['M 23:13-22', 'M 23:23-26', 'M 23:27-32', 'M 24:42-51', 'M 25:1-13', 'M 25:14-30'],
    ['L 4:16-30', 'L 4:31-37', 'L 4:38-44', 'L 5:1-11', 'L 5:33-39', 'L 6:1-5'],
    ['L 6:6-11', 'L 6:12-19', 'L 6:20-26', 'L 6:27-38', 'L 6:39-42', 'L 6:43-49'],
    ['L 7:1-10', 'L 7:11-17', 'L 7:31-35', 'L 7:36-50', 'L 8:1-3', 'L 8:4-15'],
    ['L 8:16-18', 'L 8:19-21', 'L 9:1-6', 'L 9:7-9', 'L 9:18-22', 'L 9:43b-45'],
    ['L 9:46-50', 'L 9:51-56', 'L 9:57-62', 'L 10:1-12', 'L 10:13-16', 'L 10:17-24'],
    ['L 10:25-37', 'L 10:38-42', 'L 11:1-4', 'L 11:5-13', 'L 11:15-26', 'L 11:27-28'],
    ['L 11:29-32', 'L 11:37-41', 'L 11:42-46', 'L 11:47-54', 'L 12:1-7', 'L 12:8-12'],
    ['L 12:13-21', 'L 12:35-38', 'L 12:39-48', 'L 12:49-53', 'L 12:54-59', 'L 13:1-9'],
    ['L 13:10-17', 'L 13:18-21', 'L 13:22-30', 'L 13:31-35', 'L 14:1-6', 'L 14:1,7-11'],
    ['L 14:12-14', 'L 14:15-24', 'L 14:25-33', 'L 15:1-10', 'L 16:1-8', 'L 16:9-15'],
    ['L 17:1-6', 'L 17:7-10', 'L 17:11-19', 'L 17:20-25', 'L 17:26-37', 'L 18:1-8'],
    ['L 18:35-43', 'L 19:1-10', 'L 19:11-28', 'L 19:41-44', 'L 19:45-48', 'L 20:27-40'],
    ['L 21:1-4', 'L 21:5-11', 'L 21:12-19', 'L 21:20-28', 'L 21:29-33', 'L 21:34-36'],
  ],
};

// 主日讀了某一段，平日就改讀另一段，免得同一週讀兩次
const SWAP = [
  { season: 'ordinary', week: 18, dow: 1, cycle: 'A', g: 'M 14:22-36' },
  { season: 'ordinary', week: 18, dow: 2, cycle: 'A', g: 'M 15:1-2,10-14' },
  { season: 'easter', week: 4, dow: 1, cycle: 'A', g: 'J 10:11-18' },
  { season: 'lent', week: 5, dow: 1, cycle: 'C', g: 'J 8:12-20' },
];

// 有固定日期的節日。rank：3 節日（solemnity）、5 主的慶日、7 聖母與聖人的慶日、
// 10 有自己福音的紀念日。g 可以是一段，或依甲乙丙年各一段。
const FIXED = {
  '01-01': { rank: 3, color: 'white', name: '天主之母節', g: 'L 2:16-21' },
  '01-25': { rank: 7, color: 'white', name: '聖保祿宗徒歸化', g: 'K 16:15-18' },
  '02-02': { rank: 5, color: 'white', name: '獻主節', g: 'L 2:22-40' },
  '02-22': { rank: 7, color: 'white', name: '聖伯多祿宗徒宗座', g: 'M 16:13-19' },
  '03-19': { rank: 3, color: 'white', name: '聖若瑟（聖母淨配）', g: 'M 1:16,18-21,24a' },
  '03-25': { rank: 3, color: 'white', name: '預報救主降生', g: 'L 1:26-38' },
  '04-25': { rank: 7, color: 'red', name: '聖馬爾谷聖史', g: 'K 16:15-20' },
  '05-03': { rank: 7, color: 'red', name: '聖斐理伯和聖雅各伯宗徒', g: 'J 14:6-14' },
  '05-14': { rank: 7, color: 'red', name: '聖瑪弟亞宗徒', g: 'J 15:9-17' },
  '05-31': { rank: 7, color: 'white', name: '聖母訪親', g: 'L 1:39-56' },
  '06-24': { rank: 3, color: 'white', name: '聖若翰洗者誕辰', g: 'L 1:57-66,80' },
  '06-29': { rank: 3, color: 'red', name: '聖伯多祿和聖保祿宗徒', g: 'M 16:13-19' },
  '07-03': { rank: 7, color: 'red', name: '聖多默宗徒', g: 'J 20:24-29' },
  '07-22': { rank: 7, color: 'white', name: '聖瑪利亞瑪達肋納', g: 'J 20:1-2,11-18' },
  '07-25': { rank: 7, color: 'red', name: '聖雅各伯宗徒', g: 'M 20:20-28' },
  '07-29': { rank: 10, color: 'white', name: '聖瑪爾大、聖瑪利亞和聖拉匝祿', g: 'J 11:19-27' },
  '08-06': { rank: 5, color: 'white', name: '耶穌顯聖容', g: { A: 'M 17:1-9', B: 'K 9:2-10', C: 'L 9:28b-36' } },
  '08-10': { rank: 7, color: 'red', name: '聖老楞佐執事殉道', g: 'J 12:24-26' },
  '08-15': { rank: 3, color: 'white', name: '聖母蒙召升天', g: 'L 1:39-56' },
  '08-24': { rank: 7, color: 'red', name: '聖巴爾多祿茂宗徒', g: 'J 1:45-51' },
  '08-29': { rank: 10, color: 'red', name: '聖若翰洗者殉道', g: 'K 6:17-29' },
  '09-08': { rank: 7, color: 'white', name: '聖母誕辰', g: 'M 1:1-16,18-23' },
  '09-14': { rank: 5, color: 'red', name: '光榮十字聖架', g: 'J 3:13-17' },
  '09-15': { rank: 10, color: 'white', name: '痛苦之母', g: 'J 19:25-27' },
  '09-21': { rank: 7, color: 'red', name: '聖瑪竇宗徒聖史', g: 'M 9:9-13' },
  '09-29': { rank: 7, color: 'white', name: '聖彌額爾、聖加俾額爾、聖辣法耳總領天使', g: 'J 1:47-51' },
  '10-02': { rank: 10, color: 'white', name: '護守天使', g: 'M 18:1-5,10' },
  '10-18': { rank: 7, color: 'red', name: '聖路加聖史', g: 'L 10:1-9' },
  '10-28': { rank: 7, color: 'red', name: '聖西滿和聖猶達宗徒', g: 'L 6:12-16' },
  '11-01': { rank: 3, color: 'white', name: '諸聖節', g: 'M 5:1-12a' },
  '11-02': { rank: 3, color: 'purple', name: '追思已亡', g: 'J 6:37-40' },
  '11-09': { rank: 5, color: 'white', name: '拉特朗大殿奉獻', g: 'J 2:13-22' },
  '11-30': { rank: 7, color: 'red', name: '聖安德肋宗徒', g: 'M 4:18-22' },
  '12-08': { rank: 3, color: 'white', name: '聖母無玷始胎', g: 'L 1:26-38' },
  '12-26': { rank: 7, color: 'red', name: '聖斯德望首位殉道', g: 'M 10:17-22' },
  '12-27': { rank: 7, color: 'white', name: '聖若望宗徒聖史', g: 'J 20:1a,2-8' },
  '12-28': { rank: 7, color: 'red', name: '諸聖嬰孩殉道', g: 'M 2:13-18' },
};

/* ── 出處 ───────────────────────────────────────── */
// 'L 1:1-4;4:14-21' → { book: 'luk', refs: ['1:1-4', '4:14-21'], label: '路 1:1-4; 4:14-21' }
// refs 是讀經頁認得的寫法（整節）；label 照原樣，保留 a、b。
const HEAD = /^(\d+):(\d+)[ab]?(?:-(?:(\d+):)?(\d+)[ab]?)?$/;
const MORE = /^(\d+)[ab]?(?:-(\d+)[ab]?)?$/;
function cite(s) {
  const m = /^([MKLJ]) (\S+)$/.exec(s);
  if (!m) throw new Error(`出處寫法不對：${s}`);
  const book = BOOK[m[1]];
  const refs = [];
  const labels = [];
  for (const seg of m[2].split(';')) {
    const [head, ...more] = seg.split(',');
    const h = HEAD.exec(head);
    if (!h) throw new Error(`出處寫法不對：${s}`);
    refs.push(`${h[1]}:${h[2]}${h[4] ? `-${h[3] ? `${h[3]}:` : ''}${h[4]}` : ''}`);
    const c = h[3] || h[1];
    for (const x of more) {
      const t = MORE.exec(x);
      if (!t) throw new Error(`出處寫法不對：${s}`);
      refs.push(`${c}:${t[1]}${t[2] ? `-${t[2]}` : ''}`);
    }
    labels.push(seg.split(',').join(', '));
  }
  return { book, refs, label: `${ABBR[book]} ${labels.join('; ')}` };
}

/* ── 日期 ───────────────────────────────────────── */
// 一律用「第幾天」計算（UTC），不受時區與夏令時間影響
const dn = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5);
const dowOf = (n) => (((n + 4) % 7) + 7) % 7;      // 0 是主日（1970 年 1 月 1 日是星期四）
const ymd = (n) => { const t = new Date(n * 864e5); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const sundayOnOrBefore = (n) => n - dowOf(n);

function easterOf(y) {          // 公曆復活節（匿名算法）
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dn(y, month, day);
}

const memo = new Map();
function yearDates(y) {
  if (memo.has(y)) return memo.get(y);
  const xmas = dn(y, 12, 25);
  const advent1 = xmas - (dowOf(xmas) || 7) - 21;
  const jan2 = dn(y, 1, 2);
  const epiphany = jan2 + ((7 - dowOf(jan2)) % 7);   // 1 月 2 日至 8 日之間的主日
  const baptism = ymd(epiphany)[2] >= 7 ? epiphany + 1 : epiphany + 7;
  const easter = easterOf(y);
  const r = {
    xmas, advent1, epiphany, baptism, easter,
    ash: easter - 46, palm: easter - 7, pentecost: easter + 49,
  };
  memo.set(y, r);
  return r;
}

// 甲乙丙年、單雙年：禮儀年從將臨期第一主日開始，用它大半落在的那一年來算
function cycles(n) {
  const [y] = ymd(n);
  const ly = n >= yearDates(y).advent1 ? y + 1 : y;
  return { cycle: ['C', 'A', 'B'][ly % 3], ferial: ly % 2 ? 'I' : 'II' };
}

/* ── 一天屬於哪個時期、哪一週 ───────────────────── */
// 回傳 { rank, name, color, g }。rank 越小越優先（照禮儀日的優先次序表）。
function temporal(n) {
  const [y, mo, d] = ymd(n);
  const Y = yearDates(y);
  const { cycle } = cycles(n);
  const w = dowOf(n);
  const pick = (o) => (typeof o === 'string' ? o : o[cycle]);
  const day = (name, rank, color, g) => ({ name, rank, color, g: pick(g) });

  // 將臨期
  if (n >= Y.advent1 && n < Y.xmas) {
    const week = Math.floor((n - Y.advent1) / 7) + 1;
    if (w === 0) {
      return day(`將臨期第${CN[week]}主日`, 2, week === 3 ? 'rose' : 'purple', SUNDAY.advent[cycle][week - 1]);
    }
    if (mo === 12 && d >= 17) return day(`將臨期 12月${d}日`, 9, 'purple', WEEKDAY.lateAdvent[d - 17]);
    return day(`將臨期第${CN[week]}週星期${DOW[w]}`, 13, 'purple', WEEKDAY.advent[week - 1][w - 1]);
  }

  // 聖誕期（12 月 25 日至主受洗節）
  if (n >= Y.xmas) {
    if (d === 25) return day('聖誕節', 2, 'white', 'J 1:1-18');
    const familyOnSunday = dowOf(Y.xmas) !== 0;
    if ((w === 0 && familyOnSunday) || (!familyOnSunday && d === 30)) {
      return day('聖家節', 5, 'white', SUNDAY.family[cycle]);
    }
    return day(`聖誕八日慶期 12月${d}日`, 9, 'white', WEEKDAY.octave[d] || 'J 1:1-18');
  }
  if (n <= Y.baptism) {
    if (n === Y.baptism) return day('主受洗節', 5, 'white', SUNDAY.baptism[cycle]);
    if (n === Y.epiphany) return day('主顯節', 2, 'white', 'M 2:1-12');
    if (mo === 1 && d === 1) return day('天主之母節', 3, 'white', 'L 2:16-21');
    if (n < Y.epiphany) return day(`聖誕期 1月${d}日`, 13, 'white', WEEKDAY.january[d]);
    return day(`主顯節後星期${DOW[w]}`, 13, 'white', WEEKDAY.epiphany[w - 1]);
  }

  // 四旬期與聖週
  if (n >= Y.ash && n < Y.easter) {
    if (n === Y.ash) return day('聖灰禮儀星期三', 2, 'purple', 'M 6:1-6,16-18');
    if (n < Y.ash + 4) return day(`聖灰禮儀後星期${DOW[w]}`, 9, 'purple', WEEKDAY.afterAsh[n - Y.ash - 1]);
    if (n === Y.easter - 3) return day('聖週星期四（主的晚餐）', 1, 'white', 'J 13:1-15');
    if (n === Y.easter - 2) return day('聖週星期五（救主受難）', 1, 'red', 'J 18:1-19:42');
    if (n === Y.easter - 1) return day('復活節前夕（逾越守夜禮）', 1, 'white', SUNDAY.vigil[cycle]);
    if (n === Y.palm) return day('聖枝主日（救主受難）', 2, 'red', SUNDAY.palm[cycle]);
    const week = Math.floor((n - (Y.ash + 4)) / 7) + 1;
    if (week === 6) return day(`聖週星期${DOW[w]}`, 2, 'purple', WEEKDAY.lent[5][w - 1]);
    if (w === 0) return day(`四旬期第${CN[week]}主日`, 2, week === 4 ? 'rose' : 'purple', SUNDAY.lent[cycle][week - 1]);
    return day(`四旬期第${CN[week]}週星期${DOW[w]}`, 9, 'purple', WEEKDAY.lent[week - 1][w - 1]);
  }

  // 復活期
  if (n >= Y.easter && n <= Y.pentecost) {
    if (n === Y.easter) return day('復活主日', 1, 'white', 'J 20:1-9');
    if (n === Y.pentecost) return day('聖神降臨節', 2, 'red', 'J 20:19-23');
    const week = Math.floor((n - Y.easter) / 7) + 1;
    if (week === 1) return day(`復活節八日慶期星期${DOW[w]}`, 2, 'white', WEEKDAY.easter[0][w - 1]);
    if (w === 0) {
      if (week === 7) return day('耶穌升天節', 2, 'white', SUNDAY.ascension[cycle]);
      const name = week === 2 ? '復活期第二主日（救主慈悲主日）' : `復活期第${CN[week]}主日`;
      return day(name, 2, 'white', SUNDAY.easter[cycle][week - 2]);
    }
    return day(`復活期第${CN[week]}週星期${DOW[w]}`, 13, 'white', WEEKDAY.easter[week - 1][w - 1]);
  }

  // 常年期
  let week;
  if (n < Y.ash) week = Math.floor((sundayOnOrBefore(n) - sundayOnOrBefore(Y.baptism)) / 7) + 1;
  else {
    if (n === Y.pentecost + 7) return day('天主聖三節', 3, 'white', SUNDAY.trinity[cycle]);
    if (n === Y.pentecost + 14) return day('基督聖體聖血節', 3, 'white', SUNDAY.corpus[cycle]);
    if (n === Y.pentecost + 19) return day('耶穌聖心節', 3, 'white', SUNDAY.heart[cycle]);
    if (n === Y.pentecost + 1) return day('教會之母聖母瑪利亞', 10, 'white', 'J 19:25-34');
    if (n === Y.pentecost + 20) return day('聖母無玷之心', 10, 'white', 'L 2:41-51');
    week = 34 - Math.floor((Y.advent1 - sundayOnOrBefore(n)) / 7) + 1;
  }
  if (w === 0) {
    if (week === 34) return day('基督普世君王節', 3, 'white', SUNDAY.ordinary[cycle][32]);
    return day(`常年期第${cnNum(week)}主日`, 6, 'green', SUNDAY.ordinary[cycle][week - 2]);
  }
  return day(`常年期第${cnNum(week)}週星期${DOW[w]}`, 13, 'green', WEEKDAY.ordinary[week - 1][w - 1]);
}

// 把季節與週次另外算出來，給平日的替換規則用
function seasonWeek(n) {
  const [y] = ymd(n);
  const Y = yearDates(y);
  if (n >= Y.ash + 4 && n < Y.palm) return { season: 'lent', week: Math.floor((n - (Y.ash + 4)) / 7) + 1 };
  if (n > Y.easter && n < Y.pentecost) return { season: 'easter', week: Math.floor((n - Y.easter) / 7) + 1 };
  if (n > Y.pentecost && n < Y.advent1) {
    return { season: 'ordinary', week: 34 - Math.floor((Y.advent1 - sundayOnOrBefore(n)) / 7) + 1 };
  }
  if (n > Y.baptism && n < Y.ash) {
    return { season: 'ordinary', week: Math.floor((sundayOnOrBefore(n) - sundayOnOrBefore(Y.baptism)) / 7) + 1 };
  }
  return { season: null, week: 0 };
}

/* ── 固定日期的節日要不要讓、移到哪一天 ────────── */
// 回傳這一天的固定節日（可能是從別天移過來的），沒有就是 null
function fixedOn(n) {
  const [y, mo, d] = ymd(n);
  const Y = yearDates(y);
  const key = (m, dd) => `${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const inLent = (x) => x >= Y.ash && x < Y.palm;
  const holy = (x) => x >= Y.palm && x <= Y.easter + 7;     // 聖週和復活八日慶期

  // 若瑟：四旬期主日 → 星期一；聖週裡 → 聖枝主日前的星期六
  const joseph = dn(y, 3, 19);
  let josephOn = joseph;
  if (holy(joseph)) josephOn = Y.palm - 1;
  else if (inLent(joseph) && dowOf(joseph) === 0) josephOn = joseph + 1;
  // 預報救主降生：四旬期主日 → 星期一；聖週或八日慶期裡 → 復活期第二主日後的星期一
  const annunc = dn(y, 3, 25);
  let annuncOn = annunc;
  if (holy(annunc)) annuncOn = Y.easter + 8;
  else if (inLent(annunc) && dowOf(annunc) === 0) annuncOn = annunc + 1;
  // 無玷始胎：將臨期主日 → 星期一
  const immac = dn(y, 12, 8);
  const immacOn = dowOf(immac) === 0 ? immac + 1 : immac;
  // 若翰洗者誕辰碰上耶穌聖心節 → 提前一天
  const john = dn(y, 6, 24);
  const johnOn = john === Y.pentecost + 19 ? john - 1 : john;

  const moved = [[josephOn, '03-19'], [annuncOn, '03-25'], [immacOn, '12-08'], [johnOn, '06-24']];
  for (const [at, k] of moved) if (at === n) return FIXED[k];
  const k = key(mo, d);
  if (['03-19', '03-25', '12-08', '06-24'].includes(k)) return null;   // 已移走
  return FIXED[k] || null;
}

/* ── 對外 ───────────────────────────────────────── */
// date 是 Date（用本地的年月日）或 'YYYY-MM-DD'
function lectionaryDay(date) {
  let y, m, d;
  if (typeof date === 'string') [y, m, d] = date.split('-').map(Number);
  else [y, m, d] = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  const n = dn(y, m, d);
  const { cycle, ferial } = cycles(n);
  const t = temporal(n);
  let pickDay = t;
  const f = fixedOn(n);
  if (f && f.rank < t.rank) {
    pickDay = { name: f.name, rank: f.rank, color: f.color, g: typeof f.g === 'string' ? f.g : f.g[cycle] };
  } else if (t.rank === 13 && !f) {
    const sw = seasonWeek(n);
    const hit = SWAP.find((x) => x.season === sw.season && x.week === sw.week && x.dow === dowOf(n) && x.cycle === cycle);
    if (hit) pickDay = { ...t, g: hit.g };
  }
  // 四旬期第五週星期一的替換在四旬期平日（rank 9）
  if (pickDay === t && t.rank === 9) {
    const sw = seasonWeek(n);
    const hit = SWAP.find((x) => x.season === sw.season && x.week === sw.week && x.dow === dowOf(n) && x.cycle === cycle);
    if (hit) pickDay = { ...t, g: hit.g };
  }
  const gospel = cite(pickDay.g);
  return {
    date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    name: pickDay.name, color: pickDay.color, cycle, ferial,
    sunday: dowOf(n) === 0, gospel,
  };
}

// 網頁用 lectionaryDay；測試另外看得到整張表
globalThis.lectionaryDay = lectionaryDay;
globalThis.LECTIONARY = { lectionaryDay, cite, SUNDAY, WEEKDAY, FIXED };
})();
