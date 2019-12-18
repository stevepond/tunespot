import { useState, useEffect } from 'react';
import ApolloClient, { gql } from 'apollo-boost';
import moment, { Moment } from 'moment';

const HOST = 'http://lvh.me:4000'

const GET_ARTISTS = gql`
  query GetArtists($name: String) {
      artists(name: $name) {
        name
        id
        related {
          name
        }
        tracks {
          name
          artists {
            name
          }
          uri
          album {
            release_date
            release_date_precision
          }
        }
      }
  }
`;

const GET_RELATED = gql`
  query GetRelated($id: String) {
    related(id: $id) {
      name
      id
      related {
        name
      }
      tracks {
        name
        artists {
          name
        } 
        uri
        album {
          release_date
          release_date_precision
        }
      }
    }
  }
`;

interface Options {
  artistName:string; 
  released: {
    year: number;
    delta?: number;
    pull?: number;
  }
  depth?: number;
  popularity?: number;
}

interface Artist {
  name: string;
  id: string;
  tracks: Track[]|null;
  related: Omit<Artist, 'related'>[];
}

interface Album {
  release_date: string;
  release_date_precision: string;
}

interface Track {
  uri: string;
  popularity: number;
  album: Album;
  name: string;
  artists: Artist[];
}


export function useTracks() {
  const [options, setOptions] = useState<Options>();
  const [tracks, setTracks] = useState<Track[]>();

  const client = new ApolloClient({
    uri: HOST + '/graphql',
  });

  useEffect(() => {
    (async function() {
      console.log(options);
      if (!options) return;
      setTracks(await fetchTracks(options));
    })();
  }, [options]);

  async function getRelForArtistIds(ids: string[]): Promise<Artist[]> {
    const results = await Promise.all(ids.map((id: string) => client.query<{related: Artist[]}, {id: string}>({query: GET_RELATED, variables: {id: id}, errorPolicy: 'ignore' })));
    const artists = results.flatMap(({data}) => data.related);

    const uniques = new Set<string>();
    console.log('artists', artists);
    return artists.reduce((artists, artist) => {
      if (artist && !uniques.has(artist.id)) {
        uniques.add(artist.id);
        return [...artists, artist];
      }
      return artists;
    }, [] as Artist[]);
  }

  async function getArtists(name: string): Promise<Artist[]> {
    console.log('name', name);
    const {artists} = (await client.query<{artists: Artist[]}, {name: string}>({query: GET_ARTISTS, variables: {name: name}, errorPolicy: 'ignore'})).data;
    const uniques = new Set<string>();
    if (!artists) {
      return [];
    }
    console.log('artists', artists);
    return artists.reduce((artists, artist) => {
      if (artist && !uniques.has(artist.id)) {
        uniques.add(artist.id);
        return [...artists, artist];
      }
      return artists;
    }, [] as Artist[]);
  }

  function getMomentForAlbum({release_date, release_date_precision}: Album): moment.Moment {
    switch (release_date_precision) {
      case "year":
        return moment(release_date, 'YYYY');
      case "month":
        return moment(release_date, 'YYYY-mm');
      case "day":
        return moment(release_date, 'YYYY-mm-dd');
      default:
        throw new Error('Un unknwon error has occured!')
    }
  }

  function getMaxMomentForArtist({tracks}: Artist): moment.Moment {
    if (!tracks) {
      return moment(1000, 'YYYY'); 
    }
    return moment.max((tracks || []).map(({album}) => getMomentForAlbum(album)));
  }

  function getClosestArtistByReleaseDelta(artists: Artist[], year: number, delta: number, minClosestToDatePerCycle: number): Artist[] {
    console.log('artists', artists);
    const artistDates = artists.map(artist => ([artist, getMaxMomentForArtist(artist)] as [Artist, moment.Moment]));
    // Sort by closest to year.
    const sorted = artistDates.sort(([a1, d1], [a2, d2]) => {
      if (Math.abs(d1.year() - year) < Math.abs(d2.year() - year)) {
        return - 1  ;
      }
      if (Math.abs(d1.year() - year) === Math.abs(d2.year() - year)) {
        // Sort same randomly.
        return Math.floor((Math.random() * 2) + 1) === 1 ? -1 : 1;
      }
      if (Math.abs(d1.year() - year) > Math.abs(d2.year() - year)) {
        return 1;
      }
      return 0;
    });
    const closest = [];
    console.log(sorted);
    for (let i = 0; i < minClosestToDatePerCycle; i++ ) {
      const a = sorted.shift();
      if (!a) {
        break;
      }
      closest.push(a[0]);
    }
    for (const [artist, d] of sorted) {
      if (d.isSameOrAfter(moment(year - delta, 'YYYY')) && d.isSameOrBefore(moment(year + delta, 'YYYY')) ) {
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

  function getUpToNDateCertifiedTracksForArtists(artists: Artist[], year: number, delta: number, tracksPerArtistMax: number): Track[] {
    const tracks = new Set<Track>();
    for (const a of artists) {
      let count = 0;
      for (const t of shuffle(a.tracks || [])) {
        const d = getMomentForAlbum(t.album);
        if (d.isSameOrAfter(moment(year - delta, 'YYYY')) && d.isSameOrBefore(moment(year + delta, 'YYYY')) ) {
          tracks.add(t);
          if (++count === tracksPerArtistMax) {
            break;
          }
        }
      }
    }
    return Array.from(tracks);
  } 

  async function fetchTracks({artistName, released, depth = 2}: Options): Promise<Track[]> {
    let freshArtists: Artist[] = []; 

    const encounteredArtistIds = new Set<string>();
    const trackMap = new Map<string, Track>();
    // const tracks: Track[] = [];

    const minSize = 100;
    const delta = 1;
    const minClosestToDatePerCycle = 2;
    const tracksPerArtistMax = 2;

    while (trackMap.size < minSize) {
      // Get last top N artist (or seed) and find related.
      let fetchedArtists: Artist[];
      if (freshArtists.length) {
        fetchedArtists = await getRelForArtistIds(freshArtists.map(({id}) => id));
        console.log('fethed', fetchedArtists)
      } else {
        fetchedArtists = await getArtists(artistName);
        console.log('fethed', fetchedArtists)
      }

      // Build the new freshArtists.
      freshArtists = [];
      // Make sure the new fresh artists are fresh.
      let temp = [...fetchedArtists];
      for (const a of temp) {
        if (!encounteredArtistIds.has(a.id)) {
          encounteredArtistIds.add(a.id);
          freshArtists.push(a);
        }
      }

      // For each cycle, get the top N artist that have releases closest to the date.
      freshArtists = getClosestArtistByReleaseDelta(freshArtists, released.year, delta, minClosestToDatePerCycle)

      // For each, get up to N tracks within date range.
      const tracks = getUpToNDateCertifiedTracksForArtists(freshArtists, released.year, delta, tracksPerArtistMax);
      for (const track of tracks) {
        if (!trackMap.has(track.uri)) {
          trackMap.set(track.uri, track)
        }
      }
    }

    debugger;
    return shuffle(Array.from(trackMap.values())).slice(0, minSize);
  }

  return {setOptions, tracks};
}
