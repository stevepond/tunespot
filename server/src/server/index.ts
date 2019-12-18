import express from 'express';
import { ApolloServer, gql, IResolvers } from 'apollo-server-express';
import request from 'request';
import {RESTDataSource, Request, Response, RequestOptions, HTTPCache} from 'apollo-datasource-rest'
import { ApolloError } from 'apollo-server-core';
import { DataSourceConfig } from 'apollo-datasource';
import { fetch, RequestInit } from 'apollo-server-env';

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  type Track {
    id: String
    name: String 
    album: Album 
    popularity: Int
  }

  type Album {
    release_date: String
    release_date_precision: String
  }

  type Artist {
    id: String
    name: String
    related: [Artist]
    tracks: [Track]
  }

  type Query {
    artists(name: String): [Artist]
  }
`;

class PromiseWrapper {
  readonly counter = ++counter;
  readonly promise: Promise<Response>;

  constructor(readonly action: (pw: PromiseWrapper) => Promise<Response>) {
    this.promise = action(this);
  }
}

// Resolvers define the technique for fetching the types defined in the
// schema. This resolver retrieves books from the "books" array above.
const resolvers: IResolvers = {
  Query: {
    artists: (source, {name}, {dataSources}) => {
      return dataSources.spotifyAPI.search(name, 'artist');
    },
  },
  Artist: {
    related: ({id}, params, {dataSources}) => {
      return dataSources.spotifyAPI.getRelatedArtists(id);
    },
    tracks: ({id}, params, {dataSources}) => {
      return dataSources.spotifyAPI.getTopTracks(id);
    }
  }
};

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.

const app = express();

const buff = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
const auth = buff.toString('base64')
app.get('/', function(req, response) {
  const options = {
    method: 'POST',
    headers: {'Authorization': `Basic ${auth}`},
    form: {
      grant_type: 'client_credentials'
    },
    json: true
  };

  request.post('https://accounts.spotify.com/api/token', options, ((error, res, {access_token}) => {
    console.log(access_token);

    const dataSources = () => ({
      spotifyAPI: new SpotifyWebAPI(access_token)
    });

    const server = new ApolloServer({ typeDefs, resolvers, dataSources});
    server.applyMiddleware({ app });
    response.redirect('/graphql');
  }),);
});

// The `listen` method launches a web server.
app.listen(({port: 4000}), () => {
  console.log(`🚀  Server ready!`);
});

const BASE_URL = 'https://api.spotify.com/v1/';

let counter = 0;


class SpotifyWebAPI <TContext = any> extends RESTDataSource{
  baseURL = BASE_URL;
  private readonly requestPromises: PromiseWrapper[]= [];
  private disabled = false;

  constructor(private readonly token: string) {
    super();
  }

  async waitIfNeeded(response: Response) {
    if (response.headers.has('Retry-after')) {
      console.log('retry-after hit!!, waiting...');
      const retryAfter = Number(response.headers.get('Retry-after') || 0)
      await new Promise(res => {
        setTimeout(() => {
          res();
        }, 1000 * (retryAfter + 1));
      });
    }
  }

  private async customHttpFetch(input?: string | Request | undefined, init?: RequestInit | undefined): Promise<Response> {
    if (input instanceof Request) {
      const snapshot = [...this.requestPromises];
      const action = async(pw: PromiseWrapper) => {
        await Promise.all(snapshot.map(({promise}) => promise));
        const r = await fetch(input);
        await this.waitIfNeeded(r);

        // Extra timeout.
        await new Promise(res => {
          setTimeout(() => {
            res();
          }, 125);
        });

        return r;
      };
      const p = new PromiseWrapper(action);
      this.requestPromises.push(p);
      return p.promise;
    }
    return fetch(input);
  }

  initialize(config: DataSourceConfig<TContext>): void {
    this.context = config.context;
    this.httpCache = new HTTPCache(config.cache, this.customHttpFetch.bind(this));
  }

  async willSendRequest(request: RequestOptions) {
    request.headers.set('Authorization', `Bearer ${this.token}`);
  }

  async get(path: string, params?: {[key: string]: Object | Object[] | undefined}): Promise<any> {
    const handleResponse = (response: Response) => {
      if (response.status === 429) {
        console.log('429!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return this.get(path, params);
      } 
      throw new Error('unknown');
    };

    if (this.disabled) {
      throw new Error('aborted!');
    }

    try {
      const r = await super.get(path, params);
      if (r instanceof Response) {
        return handleResponse(r)
      } 
      return r;
    } catch(e) {
      console.log('error!!!!!!!!!!!!!!!!!!!!!!');
      if (e instanceof ApolloError) {
        const {response} = e.extensions;
        if (response instanceof Response) {
          try {
            return handleResponse(response);
          } catch(e) {}
        }
      }
      this.disabled = true;
      throw (e);
    }
  }

  async search(query: string, type: 'artist' = 'artist', limit = 1) {
    const q = encodeURIComponent(query);
    const {artists}  = await this.get('search', {q, type, limit});
    return artists.items;
  }

  async getRelatedArtists(id: string) {
    const {artists} = await this.get(`artists/${id}/related-artists`);
    return artists;
  }

  async getTopTracks(id: string) {
      const r = await this.get(`artists/${id}/top-tracks`, {country: 'US'});
      return r ? r.tracks : [];
  }
}
