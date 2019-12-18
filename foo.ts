interface Options {
  artist:string; 
  released: {
    year: number;
    delta: number;
    pull: number;
  }
  depth: number;
  popularity: number;
}

interface Response {
  artists: Artist[]
}

interface Artist {
  name: string;
  id: string;
  tracks: Track[];
  related: Omit<Artist, 'related'>[];
}

interface Album {
  release_date: number;
}

interface Track {
  id: string;
  popularity: number;
  album: Album;
  name: string;
}

function getRelForArtistIds(ids: string[]): Artist[] {
  return [{name: '', id: '', tracks: [], related: []}];
}

function getRelForArtistName(name: string): Artist[] {
  return [{name: '', id: '', tracks: [], related: []}];
}

function getClosestArtistByReleaseDelta(artists: Artist[], date: number, delta: number, minClosestToDatePerCycle: number): Artist[] {
  const artistDates = artists.map(artist => ([artist, Math.max(...artist.tracks.map(t => Number(t.album.release_date)))] as [Artist, number]));
  const sorted = artistDates.sort(([a1, d1], [a2, d2]) => {
    if (d1 < d2) return -1;
    if (d1 === d2) return 0;
    if (d2 > d1) return 1;
    return 0;
  });
  const closest = [];
  for (let i = 0; i < minClosestToDatePerCycle; i++ ) {
    closest.push(sorted.shift()![0]);
  }
  for (const [artist, d] of sorted) {
    if (d >= date - delta && d <= date + delta) {
      closest.push(artist);
    } else {
      break;
    }
  }
  return closest;
}

function shuffle<T>(a: T[]): T[] {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
  }
  return a;
}

function getUpToNDateCertifiedTracksForArtists(artists: Artist[], date: number, delta: number, tracksPerArtistMax: number): Track[] {
  const tracks = new Set<Track>();
  for (const a of artists) {
    let count = 0;
    for (const t of shuffle(a.tracks)) {
      const d = t.album.release_date;
      if (d >= date - delta && d <= date + delta) {
        tracks.add(t);
        if (++count === tracksPerArtistMax) {
          break;
        }
      }
    }
  }
  return Array.from(tracks);
} 

async function compute({artist, released, depth = 2}: Options) {
  let currentArtists: Artist[] = []; 

  const encounteredArtistIds = new Set<string>();
  const set = new Set<string>();

  const minSize = 100;
  const date = 2019;
  const delta = 1;
  const minClosestToDatePerCycle = 2;
  const tracksPerArtistMax = 2;

  while (set.size < minSize) {
    // Get last top N artist (or seed) and find related.
    let artists;
    if (currentArtists.length) {
      artists = await getRelForArtistIds(currentArtists.map(({id}) => id));
    } else {
      artists = await getRelForArtistName(artist);
    }

    // Make sure these artists are fresh.
    let temp = [...artists];
    for (const a of temp) {
      if (!encounteredArtistIds.has(a.id)) {
        encounteredArtistIds.add(a.id);
        artists.push(a);
      }
    }

    // For each cycle, get the top N artist that have releases closest to the date.
    currentArtists = getClosestArtistByReleaseDelta(artists, date, delta, minClosestToDatePerCycle)

    // For each, get up to N tracks within date range.
    const tracks = getUpToNDateCertifiedTracksForArtists(artists, date, delta, tracksPerArtistMax);
    for (const {id} of tracks) {
      set.add(id)
    }
  }

  return shuffle(Array.from(set)).slice(0, minSize);
}