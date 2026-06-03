import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App.js';
import { Dashboard } from './pages/Dashboard.js';
import { Companies } from './pages/Companies.js';
import { Contacts } from './pages/Contacts.js';
import { CompanyDetail } from './pages/CompanyDetail.js';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'companies', element: <Companies /> },
      { path: 'companies/:id', element: <CompanyDetail /> },
      { path: 'contacts', element: <Contacts /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
