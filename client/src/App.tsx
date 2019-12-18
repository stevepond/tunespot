import React, { useState, FormEvent } from 'react';
import './App.css';
import {Form} from 'react-bootstrap'

const App: React.FC = () => {
  const [year, setYear] = useState('2019');
  const [query, setQuery] = useState('');

  function onSubmit() {
  }

  return (
    <React.Fragment>
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
            </Form.Group>
          </Form>
        </header>
      </div>
    </React.Fragment>
  );
}

export default App;
