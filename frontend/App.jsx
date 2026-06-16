import { useState } from 'react';
import Header from './components/Header.jsx';
import PEPost from './pages/PEPost.jsx';
import Home from './pages/Home.jsx';
import './App.css';

export default function App() {
  const [page, setPage] = useState('home');

  const navigateTo = (nextPage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <Header activePage={page} onNavigate={navigateTo} />
      {page === 'home' ? (
        <Home onOpenPost={() => navigateTo('pe-post')} />
      ) : (
        <PEPost />
      )}
    </div>
  );
}
