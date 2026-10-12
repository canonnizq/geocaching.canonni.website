export interface Series {
  slug: string;
  title: string;
  summary: string;
  codes: string[];
}

export const SERIES: Series[] = [
  {
    slug: 'chapter',
    title: 'CHAPTER',
    summary: 'Neither Powerful, nor a Trail, nor Encompassing Rings.',
    codes: [
      'GCBX05C',
      'GCBX06H',
      'GCBX071',
      'GCBX07P',
      'GCBX0AX',
      'GCBQV6D',
      'GCBX0C4',
      'GCBT0R0',
      'GCBX0CV',
      'GCBP9YP',
      'GCBX26K',
      'GCBX296',
      'GCBX2EJ',
      'GCBVHRE',
      'GCBX2GW',
      'GCBX2MR',
      'GCBX2NT',
      'GCBX4CF',
      'GCBX4DJ',
      'GCBX4FB',
      'GCBX4FV',
      'GCBX4BD',
      'GCBX4GM',
      'GCBXHXB',
      'GCBXHXR',
      'GCBXHYD',
      'GCBXHYW',
      'GCBXHZX',
      'GCBXJ09',
      'GCBXJ0Z',
      'GCBXJ86',
      'GCBXJAE',
    ],
  },
  {
    slug: 'pp',
    title: 'Plural Puzzles',
    summary: 'Plural Puzzles Providing Players Problems Probably Possible',
    codes: [
      'GCBVXP6',
      'GCBXCMX',
      'GCBVTKB',
      'GCBQV6D',
    ],
  },
  {
    slug: 'longyang',
    title: 'Longyang Road',
    summary: 'Four ways to and from a station nobody wants to be.',
    codes: [
      'GCBYWQN',
      'GCBYWQP',
      'GCBYWQZ',
      'GCBYWR5',
    ]
  },
  {
    slug: 'love',
    title: '💕 LOVE',
    summary: 'Was planning on a fifth cache. This almost became 🫒 OLIVE.',
    codes: [
      'GCBZ2X5',
      'GCBZ2XF',
      'GCBZ2XN',
      'GCBZ2Y0',
    ]
  },
  {
    slug: 'huangpu',
    title: '环游浦江-黄浦',
    summary: '反黄复卢! 反黄复南! 反黄赌毒(?)',
    codes: [
      'GCBZ0KA',
      'GCBZ0KK',
      'GCBZ0KT',
      'GCBZ0M5',
      'GCBZ0M8',
      'GCBZ0MA',
      'GCBZ0MT',
      'GCBZ0N1',
      'GCBZ0NA',
      'GCBZ0NH',
      'GCBZ0NV',
      'GCBZ0P3',
      'GCBZ0PC',
    ]
  },
];

export function getSeries(slug: string): Series | undefined {
  return SERIES.find((series) => series.slug === slug);
}

export const defaultSeries: Series = SERIES[0];
