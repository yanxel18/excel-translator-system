import React from 'react';
import ReactDOM from 'react-dom/client';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import App from './App';
import { LocaleProvider } from './features/shared/LocaleProvider';
import './index.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light" theme={{ primaryColor: 'blue', defaultRadius: 'md', fontFamily: 'Inter, system-ui, sans-serif', fontSizes: { xs: '0.6875rem', sm: '0.75rem', md: '0.8125rem', lg: '0.875rem', xl: '1rem' }, headings: { fontFamily: 'Inter, system-ui, sans-serif', fontWeight: '600', sizes: { h1: { fontSize: '1.625rem', lineHeight: '1.25' }, h2: { fontSize: '1.125rem', lineHeight: '1.35' }, h3: { fontSize: '1rem', lineHeight: '1.4' } } } }}>
      <LocaleProvider><App /></LocaleProvider>
    </MantineProvider>
  </React.StrictMode>,
);
