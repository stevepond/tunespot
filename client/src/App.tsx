import React, { useState, useEffect} from 'react';
import './App.css';
import {Form} from 'react-bootstrap'
import { useTracks } from './hooks';

interface Artist {
  name: string;
  id: string;
  related: Artist[];
}

const App: React.FC = () => {
  const [year, setYear] = useState('2019');
  const [query, setQuery] = useState('');
  const {tracks = [], setOptions} = useTracks();
  const setToken = useState('')[1];

  const trackList = tracks.map(t => (<li key={t.uri}>{t.artists[0].name}: {t.name}</li>));
  const HOST = 'http://lvh.me:4000'

  useEffect(() => {
    console.log('1');
    (async function() {
      const response = await fetch(HOST + '/');
      const {token} = await response.json();
      setToken(token);
    })();
  }, [setToken]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOptions({artistName: query, released: {year: Number(year)}});
  }

  return (
      <div className="App">
        <header className="App-header">
          <Form onSubmit={onSubmit}>
            <Form.Group controlId="foo">
              <Form.Label>Query</Form.Label>
              <Form.Control
                  onChange={(event: React.FormEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
                  value={query} type="text" />
              <Form.Label>Year {year} </Form.Label>
              <Form.Control
                  onChange={(event: React.FormEvent<HTMLInputElement>) => setYear(event.currentTarget.value)}
                  value={year} min="1920" max="2020" type="range" />
              <Form.Control
                  value="Submit" type="submit" />
            </Form.Group>
          </Form>
          <ul>{trackList}</ul>
        </header>
       </div>

  );
}

export default App;
