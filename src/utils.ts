import { MONTH_MAPPING } from './constants';

type ImageFrame = {
  url: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  year: string; // YYYY
  month: string; // Full month name (e.g., "January")
  day: string; // DD
};

export type TimeMachineData = {
  frames: ImageFrame[];
  dateIndex: Record<string, number>;
};

const GCS_BUCKET = import.meta.env.VITE_GCS_BUCKET as string;
const GCS_API_BASE = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o`;
const GCS_PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;

let cachedImageData: Promise<TimeMachineData> | null = null;

async function listAllImages(): Promise<string[]> {
  const urls: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams();
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${GCS_API_BASE}?${params}`);
    if (!res.ok) throw new Error(`GCS listing failed: ${res.status}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      urls.push(`${GCS_PUBLIC_BASE}/${item.name}`);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return urls.sort();
}

function parseImageFilename(url: string): ImageFrame {
  const fileName = url.split('/').pop() || '';
  const datetime = fileName.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})/);
  if (!datetime) {
    throw new Error(`Filename ${fileName} does not match expected format YYYY-MM-DD_HH-MM.jpg`);
  }

  const datePart = datetime[1]; // "YYYY-MM-DD"
  const timePart = datetime[2].replace('-', ':');
  const [year, month, day] = datePart.split('-');
  const monthNum = month as keyof typeof MONTH_MAPPING; // "MM"

  return {
    url,
    date: datePart,
    time: timePart,
    year,
    month: MONTH_MAPPING[monthNum],
    day,
  };
}

export function getProcessedImages(): Promise<TimeMachineData> {
  if (!cachedImageData) {
    cachedImageData = listAllImages().then((imgList) => {
      const frames = imgList.map(parseImageFilename);

      const dateIndex: Record<string, number> = {};
      frames.forEach((frame, idx) => {
        if (frame.date && !(frame.date in dateIndex)) {
          dateIndex[frame.date] = idx;
        }
      });
      return { frames, dateIndex };
    });
  }
  return cachedImageData;
}
