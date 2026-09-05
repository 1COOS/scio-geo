export const FEATURED_COUNTRY_CODES = [
  'CN',
  'JP',
  'IN',
  'ID',
  'EG',
  'ZA',
  'FR',
  'RU',
  'US',
  'MX',
  'BR',
  'AU',
] as const

// Natural Earth publishes Taiwan island as numeric feature 158. Scio Geo keeps
// the 195-country catalogue unchanged and incorporates that island geometry
// into China's numeric feature 156 for rendering and hit testing.
export const countryBoundaryGeometrySupplements: Record<string, string[]> = {
  '156': ['158'],
}

type FeaturedContent = {
  highlights: [
    { text: string; sourceIds: string[] },
    { text: string; sourceIds: string[] },
    { text: string; sourceIds: string[] },
  ]
}

export const featuredCountryContent: Record<
  (typeof FEATURED_COUNTRY_CODES)[number],
  FeaturedContent
> = {
  CN: {
    highlights: [
      {
        text: '中国地形从世界最高峰珠穆朗玛峰延伸到沿海平原，地貌非常丰富。',
        sourceIds: ['britannica-china'],
      },
      {
        text: '大熊猫主要生活在四川、陕西和甘肃的山地森林中。',
        sourceIds: ['wwf-giant-panda'],
      },
      {
        text: '中国地域辽阔，从东部沿海到西部高原分布着多种气候与自然景观。',
        sourceIds: ['britannica-china'],
      },
    ],
  },
  JP: {
    highlights: [
      {
        text: '日本由数千个岛屿组成，最大的四个岛是本州、北海道、九州和四国。',
        sourceIds: ['britannica-japan'],
      },
      {
        text: '富士山是一座活火山，也是日本最高峰。',
        sourceIds: ['britannica-japan'],
      },
      {
        text: '日本位于环太平洋地震带，火山和地震活动塑造了这里的地貌。',
        sourceIds: ['britannica-japan'],
      },
    ],
  },
  IN: {
    highlights: [
      {
        text: '印度拥有从喜马拉雅山脉到热带海岸的多样自然环境。',
        sourceIds: ['britannica-india'],
      },
      {
        text: '恒河流域孕育了许多历史悠久的城市与文化。',
        sourceIds: ['britannica-india'],
      },
      {
        text: '印度各地使用许多语言，文化传统也呈现出丰富的地区差异。',
        sourceIds: ['britannica-india'],
      },
    ],
  },
  ID: {
    highlights: [
      {
        text: '印度尼西亚是世界上岛屿数量最多的国家之一。',
        sourceIds: ['britannica-indonesia'],
      },
      {
        text: '这里横跨赤道，拥有大片热带雨林和丰富的海洋生物。',
        sourceIds: ['britannica-indonesia'],
      },
      {
        text: '印度尼西亚位于多条板块交界附近，拥有许多火山。',
        sourceIds: ['britannica-indonesia'],
      },
    ],
  },
  EG: {
    highlights: [
      {
        text: '尼罗河为沙漠中的城市和农田提供了重要水源。',
        sourceIds: ['britannica-egypt'],
      },
      {
        text: '吉萨金字塔群中包括古代世界七大奇迹里唯一仍基本保存的建筑。',
        sourceIds: ['unesco-giza'],
      },
      {
        text: '苏伊士运河连接地中海与红海，是重要的国际航道。',
        sourceIds: ['britannica-egypt'],
      },
    ],
  },
  ZA: {
    highlights: [
      {
        text: '南非分别在比勒陀利亚、开普敦和布隆方丹设置行政、立法和司法首都。',
        sourceIds: ['britannica-south-africa'],
      },
      {
        text: '南非拥有从草原、沙漠边缘到漫长海岸线的多样自然环境。',
        sourceIds: ['britannica-south-africa'],
      },
      {
        text: '桌山俯瞰开普敦，顶部平坦，是当地醒目的自然地标。',
        sourceIds: ['britannica-south-africa'],
      },
    ],
  },
  FR: {
    highlights: [
      {
        text: '法国本土大致呈六边形，因此有时被称为“六边形国家”。',
        sourceIds: ['britannica-france'],
      },
      {
        text: '法国的历史建筑、艺术收藏和文学传统对世界文化产生了广泛影响。',
        sourceIds: ['britannica-france'],
      },
      {
        text: '法国既有大西洋和地中海海岸，也拥有阿尔卑斯山脉的一部分。',
        sourceIds: ['britannica-france'],
      },
    ],
  },
  RU: {
    highlights: [
      {
        text: '俄罗斯横跨欧洲和亚洲，是世界面积最大的国家。',
        sourceIds: ['britannica-russia'],
      },
      {
        text: '贝加尔湖是世界最深的淡水湖。',
        sourceIds: ['britannica-russia'],
      },
      {
        text: '西伯利亚森林是地球北方针叶林的重要组成部分。',
        sourceIds: ['britannica-russia'],
      },
    ],
  },
  US: {
    highlights: [
      {
        text: '美国由50个州和一个联邦特区组成。',
        sourceIds: ['britannica-united-states'],
      },
      {
        text: '黄石国家公园于1872年建立，常被称为世界上第一座国家公园。',
        sourceIds: ['nps-yellowstone'],
      },
      {
        text: '阿拉斯加与夏威夷不与美国本土其他48州相连。',
        sourceIds: ['britannica-united-states'],
      },
    ],
  },
  MX: {
    highlights: [
      {
        text: '墨西哥是玉米、番茄和可可等许多重要作物的重要起源与驯化地区。',
        sourceIds: ['britannica-mexico'],
      },
      {
        text: '玛雅和阿兹特克文明在这里留下了众多城市遗址。',
        sourceIds: ['britannica-mexico'],
      },
      {
        text: '墨西哥地形从高原和火山山脉延伸到热带海岸。',
        sourceIds: ['britannica-mexico'],
      },
    ],
  },
  BR: {
    highlights: [
      {
        text: '巴西拥有亚马孙雨林和世界水量最大的河流系统。',
        sourceIds: ['britannica-brazil'],
      },
      {
        text: '巴西是南美洲面积最大的国家，也是该洲唯一以葡萄牙语为主要语言的国家。',
        sourceIds: ['britannica-brazil'],
      },
      {
        text: '巴西拥有漫长的大西洋海岸线，地貌从热带雨林延伸到高原和湿地。',
        sourceIds: ['britannica-brazil'],
      },
    ],
  },
  AU: {
    highlights: [
      {
        text: '澳大利亚既是一个国家，也占据了澳大利亚大陆的大部分。',
        sourceIds: ['britannica-australia'],
      },
      {
        text: '袋鼠、考拉和鸭嘴兽等许多动物只自然分布在这一地区。',
        sourceIds: ['britannica-australia'],
      },
      {
        text: '大堡礁由数千个珊瑚礁和岛屿组成。',
        sourceIds: ['unesco-great-barrier-reef'],
      },
    ],
  },
}

export const subregionChineseNames: Record<string, string> = {
  'Australia and New Zealand': '澳大利亚和新西兰',
  Caribbean: '加勒比地区',
  'Central America': '中美洲',
  'Central Asia': '中亚',
  'Central Europe': '中欧',
  'Eastern Africa': '东非',
  'Eastern Asia': '东亚',
  'Eastern Europe': '东欧',
  Melanesia: '美拉尼西亚',
  Micronesia: '密克罗尼西亚',
  'Middle Africa': '中非',
  'North America': '北美洲',
  'Northern Africa': '北非',
  'Northern Europe': '北欧',
  Polynesia: '波利尼西亚',
  'South America': '南美洲',
  'South-Eastern Asia': '东南亚',
  'Southeast Europe': '东南欧',
  'Southern Africa': '南部非洲',
  'Southern Asia': '南亚',
  'Southern Europe': '南欧',
  'Western Africa': '西非',
  'Western Asia': '西亚',
  'Western Europe': '西欧',
}

export const languageChineseNameOverrides: Record<string, string> = {
  bar: '巴伐利亚语',
  bjz: '贝里斯克里奥尔语',
  bwg: '奇巴尔韦语',
  cnr: '黑山语',
  hgm: '科伊科伊语',
  hif: '斐济印地语',
  jam: '牙买加克里奥尔语',
  kck: '卡兰加语',
  khi: '科伊桑语',
  kwn: '宽加利语',
  ndc: '恩道语',
  nzs: '新西兰手语',
  pov: '上几内亚克里奥尔语',
  smi: '萨米语',
  toi: '汤加语（赞比亚）',
  zdj: '科摩罗语',
  zib: '津巴布韦手语',
}

export const currencyOverrides: Record<
  string,
  { name: { zh: string; en: string }; symbol: string }
> = {
  KID: { name: { zh: '基里巴斯元', en: 'Kiribati dollar' }, symbol: '$' },
  TVD: { name: { zh: '图瓦卢元', en: 'Tuvaluan dollar' }, symbol: '$' },
  ZWB: { name: { zh: '津巴布韦元', en: 'Zimbabwean dollar' }, symbol: '$' },
}

export const countryCurrencyOverrides: Record<
  string,
  Record<string, { name: string; symbol: string }>
> = {
  FM: { USD: { name: 'United States dollar', symbol: '$' } },
}

export const adjacentRegionNames = {
  ESH: { zh: '西撒哈拉', en: 'Western Sahara' },
  GIB: { zh: '直布罗陀', en: 'Gibraltar' },
  GUF: { zh: '法属圭亚那', en: 'French Guiana' },
  HKG: { zh: '中国香港', en: 'Hong Kong, China' },
  MAC: { zh: '中国澳门', en: 'Macao, China' },
  UNK: { zh: '科索沃', en: 'Kosovo' },
} as const

export const capitalNameAliases: Record<string, string> = {
  "GD:St. George's": "Saint George's",
  'KZ:Astana': 'Nur-Sultan',
  'KI:South Tarawa': 'Tarawa',
  'MM:Naypyidaw': 'Nay Pyi Taw',
  'MN:Ulan Bator': 'Ulaanbaatar',
  'SM:City of San Marino': 'San Marino',
  'US:Washington D.C.': 'Washington',
}

export const capitalCoordinateOverrides: Record<
  string,
  { latitude: number; longitude: number }
> = {
  'PS:Ramallah': { latitude: 31.9038, longitude: 35.2034 },
}

export const capitalChineseNames: Record<string, string> = {
  'AD:Andorra la Vella': '安道尔城',
  'AE:Abu Dhabi': '阿布扎比',
  'AF:Kabul': '喀布尔',
  "AG:Saint John's": '圣约翰',
  'AL:Tirana': '地拉那',
  'AM:Yerevan': '埃里温',
  'AO:Luanda': '罗安达',
  'AR:Buenos Aires': '布宜诺斯艾利斯',
  'AT:Vienna': '维也纳',
  'AZ:Baku': '巴库',
  'BA:Sarajevo': '萨拉热窝',
  'BB:Bridgetown': '布里奇敦',
  'BD:Dhaka': '达卡',
  'BE:Brussels': '布鲁塞尔',
  'BF:Ouagadougou': '瓦加杜古',
  'BG:Sofia': '索非亚',
  'BH:Manama': '麦纳麦',
  'BI:Gitega': '基特加',
  'BJ:Porto-Novo': '波多诺伏',
  'BN:Bandar Seri Begawan': '斯里巴加湾市',
  'BO:Sucre': '苏克雷',
  'BS:Nassau': '拿骚',
  'BT:Thimphu': '廷布',
  'BW:Gaborone': '哈博罗内',
  'BY:Minsk': '明斯克',
  'BZ:Belmopan': '贝尔莫潘',
  'CA:Ottawa': '渥太华',
  'CD:Kinshasa': '金沙萨',
  'CF:Bangui': '班吉',
  'CG:Brazzaville': '布拉柴维尔',
  'CH:Bern': '伯尔尼',
  'CI:Yamoussoukro': '亚穆苏克罗',
  'CL:Santiago': '圣地亚哥',
  'CM:Yaoundé': '雅温得',
  'CN:Beijing': '北京',
  'CO:Bogotá': '波哥大',
  'CR:San José': '圣何塞',
  'CU:Havana': '哈瓦那',
  'CV:Praia': '普拉亚',
  'CY:Nicosia': '尼科西亚',
  'CZ:Prague': '布拉格',
  'DE:Berlin': '柏林',
  'DJ:Djibouti': '吉布提市',
  'DK:Copenhagen': '哥本哈根',
  'DM:Roseau': '罗索',
  'DO:Santo Domingo': '圣多明各',
  'DZ:Algiers': '阿尔及尔',
  'EC:Quito': '基多',
  'EE:Tallinn': '塔林',
  'JP:Tokyo': '东京',
  'IN:New Delhi': '新德里',
  'ID:Jakarta': '雅加达',
  'EG:Cairo': '开罗',
  'ER:Asmara': '阿斯马拉',
  'ES:Madrid': '马德里',
  'ET:Addis Ababa': '亚的斯亚贝巴',
  'FI:Helsinki': '赫尔辛基',
  'FJ:Suva': '苏瓦',
  'FM:Palikir': '帕利基尔',
  'ZA:Pretoria': '比勒陀利亚',
  'ZA:Bloemfontein': '布隆方丹',
  'ZA:Cape Town': '开普敦',
  'FR:Paris': '巴黎',
  'GA:Libreville': '利伯维尔',
  'GB:London': '伦敦',
  "GD:St. George's": '圣乔治',
  'GE:Tbilisi': '第比利斯',
  'GH:Accra': '阿克拉',
  'GM:Banjul': '班珠尔',
  'GN:Conakry': '科纳克里',
  'GQ:Malabo': '马拉博',
  'GR:Athens': '雅典',
  'GT:Guatemala City': '危地马拉城',
  'GW:Bissau': '比绍',
  'GY:Georgetown': '乔治敦',
  'HN:Tegucigalpa': '特古西加尔巴',
  'HR:Zagreb': '萨格勒布',
  'HT:Port-au-Prince': '太子港',
  'HU:Budapest': '布达佩斯',
  'IE:Dublin': '都柏林',
  'IL:Jerusalem': '耶路撒冷',
  'IQ:Baghdad': '巴格达',
  'IR:Tehran': '德黑兰',
  'IS:Reykjavik': '雷克雅未克',
  'IT:Rome': '罗马',
  'JM:Kingston': '金斯敦',
  'JO:Amman': '安曼',
  'KE:Nairobi': '内罗毕',
  'KG:Bishkek': '比什凯克',
  'KH:Phnom Penh': '金边',
  'KI:South Tarawa': '南塔拉瓦',
  'KM:Moroni': '莫罗尼',
  'KN:Basseterre': '巴斯特尔',
  'KP:Pyongyang': '平壤',
  'KR:Seoul': '首尔',
  'KW:Kuwait City': '科威特城',
  'KZ:Astana': '阿斯塔纳',
  'LA:Vientiane': '万象',
  'LB:Beirut': '贝鲁特',
  'LC:Castries': '卡斯特里',
  'LI:Vaduz': '瓦杜兹',
  'LK:Colombo': '科伦坡',
  'LR:Monrovia': '蒙罗维亚',
  'LS:Maseru': '马塞卢',
  'LT:Vilnius': '维尔纽斯',
  'LU:Luxembourg': '卢森堡市',
  'LV:Riga': '里加',
  'LY:Tripoli': '的黎波里',
  'MA:Rabat': '拉巴特',
  'MC:Monaco': '摩纳哥',
  'MD:Chișinău': '基希讷乌',
  'ME:Podgorica': '波德戈里察',
  'MG:Antananarivo': '塔那那利佛',
  'MH:Majuro': '马朱罗',
  'MK:Skopje': '斯科普里',
  'ML:Bamako': '巴马科',
  'MM:Naypyidaw': '内比都',
  'MN:Ulan Bator': '乌兰巴托',
  'MR:Nouakchott': '努瓦克肖特',
  'MT:Valletta': '瓦莱塔',
  'MU:Port Louis': '路易港',
  'MV:Malé': '马累',
  'MW:Lilongwe': '利隆圭',
  'RU:Moscow': '莫斯科',
  'US:Washington D.C.': '华盛顿哥伦比亚特区',
  'MX:Mexico City': '墨西哥城',
  'MY:Kuala Lumpur': '吉隆坡',
  'MZ:Maputo': '马普托',
  'NA:Windhoek': '温得和克',
  'NE:Niamey': '尼亚美',
  'NG:Abuja': '阿布贾',
  'NI:Managua': '马那瓜',
  'NL:Amsterdam': '阿姆斯特丹',
  'NO:Oslo': '奥斯陆',
  'NP:Kathmandu': '加德满都',
  'NR:Yaren': '亚伦',
  'NZ:Wellington': '惠灵顿',
  'OM:Muscat': '马斯喀特',
  'PA:Panama City': '巴拿马城',
  'PE:Lima': '利马',
  'PG:Port Moresby': '莫尔兹比港',
  'PH:Manila': '马尼拉',
  'PK:Islamabad': '伊斯兰堡',
  'PL:Warsaw': '华沙',
  'PT:Lisbon': '里斯本',
  'PW:Ngerulmud': '恩吉鲁穆德',
  'PY:Asunción': '亚松森',
  'QA:Doha': '多哈',
  'RO:Bucharest': '布加勒斯特',
  'RS:Belgrade': '贝尔格莱德',
  'RW:Kigali': '基加利',
  'SA:Riyadh': '利雅得',
  'SB:Honiara': '霍尼亚拉',
  'SC:Victoria': '维多利亚',
  'SD:Khartoum': '喀土穆',
  'SE:Stockholm': '斯德哥尔摩',
  'SG:Singapore': '新加坡',
  'SI:Ljubljana': '卢布尔雅那',
  'SK:Bratislava': '布拉迪斯拉发',
  'SL:Freetown': '弗里敦',
  'SM:City of San Marino': '圣马力诺市',
  'SN:Dakar': '达喀尔',
  'SO:Mogadishu': '摩加迪沙',
  'SR:Paramaribo': '帕拉马里博',
  'SS:Juba': '朱巴',
  'ST:São Tomé': '圣多美',
  'SV:San Salvador': '圣萨尔瓦多',
  'SY:Damascus': '大马士革',
  'SZ:Lobamba': '洛班巴',
  "TD:N'Djamena": '恩贾梅纳',
  'TG:Lomé': '洛美',
  'TH:Bangkok': '曼谷',
  'TJ:Dushanbe': '杜尚别',
  'TL:Dili': '帝力',
  'TM:Ashgabat': '阿什哈巴德',
  'TN:Tunis': '突尼斯市',
  "TO:Nuku'alofa": '努库阿洛法',
  'TR:Ankara': '安卡拉',
  'TT:Port of Spain': '西班牙港',
  'TV:Funafuti': '富纳富提',
  'TZ:Dodoma': '多多马',
  'UA:Kyiv': '基辅',
  'UG:Kampala': '坎帕拉',
  'UY:Montevideo': '蒙得维的亚',
  'UZ:Tashkent': '塔什干',
  'BR:Brasília': '巴西利亚',
  'AU:Canberra': '堪培拉',
  'VA:Vatican City': '梵蒂冈城',
  'PS:Ramallah': '拉姆安拉',
  'VC:Kingstown': '金斯敦',
  'VE:Caracas': '加拉加斯',
  'VN:Hanoi': '河内',
  'VU:Port Vila': '维拉港',
  'WS:Apia': '阿皮亚',
  "YE:Sana'a": '萨那',
  'ZM:Lusaka': '卢萨卡',
  'ZW:Harare': '哈拉雷',
}
