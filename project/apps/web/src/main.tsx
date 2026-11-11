import React from 'react';
import ReactDOM from 'react-dom/client';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import App from './App';
import './App.css';
import { LocaleProvider } from './features/shared/LocaleProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light" theme={{ primaryColor: 'teal', defaultRadius: 'md' }}>
      <LocaleProvider><App /></LocaleProvider>
    </MantineProvider>
  </React.StrictMode>,
);
