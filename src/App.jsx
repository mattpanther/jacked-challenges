import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Hub from './pages/Hub';
import TenBy400 from './pages/TenBy400';
import Classic from './pages/Classic';

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/10x400" element={<TenBy400 />} />
        <Route path="/classic" element={<Classic />} />
      </Routes>
    </>
  );
}
