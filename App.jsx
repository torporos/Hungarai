import React, { useState, useEffect } from 'react';

export default function App() {
const [currentView, setCurrentView] = useState('lessons');
const [isLoading, setIsLoading] = useState(true);

// Zde se později budou načítat naše 4 oddělené JSON soubory
useEffect(() => {
const loadModules = async () => {
// Simulace stahování dat (prozatím jen zdržení)
setTimeout(() => setIsLoading(false), 800);
};
loadModules();
}, []);

// --- Windows 7 Style CSS třídy (Tailwind) ---
// Hranatý design, lineární přechody, vnitřní stíny pro 3D efekt, výrazná ohraničení
const win7Panel = "bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.5)] rounded-none";

const win7ButtonRed = "bg-gradient-to-b from-[#ce2939] to-[#8a1a25] border border-[#591017] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:from-[#e03848] hover:to-[#a32230] active:from-[#8a1a25] active:to-[#ce2939] text-white px-5 py-2 text-sm font-bold rounded-none cursor-pointer";

const win7ButtonGreen = "bg-gradient-to-b from-[#477050] to-[#2d4733] border border-[#1b2b1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] hover:from-[#588a62] hover:to-[#385940] active:from-[#2d4733] active:to-[#477050] text-white px-5 py-2 text-sm font-bold rounded-none cursor-pointer";

const win7ButtonWhite = "bg-gradient-to-b from-slate-200 to-slate-400 border border-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:from-white hover:to-slate-300 active:from-slate-400 active:to-slate-200 text-slate-900 px-5 py-2 text-sm font-bold rounded-none cursor-pointer";

if (isLoading) {
return (
<div className="min-h-screen flex items-center justify-center font-sans" style={{ backgroundColor: '#370505' }}>
<div className={${win7Panel} p-8 text-center flex flex-col items-center}>

Načítání databází...


);
}

return (
<div className="min-h-screen font-sans p-4 text-slate-100" style={{ backgroundColor: '#370505' }}>

  {/* Hlavička - Maďarská trikolóra & Navigace */}
  <header className={`${win7Panel} p-4 mb-6 flex flex-col md:flex-row justify-between items-center border-t-4 border-t-[#ce2939] border-b-4 border-b-[#477050]`}>
    <div className="mb-4 md:mb-0 flex items-center gap-3">
      <div className="w-8 h-8 bg-gradient-to-b from-slate-100 to-slate-300 border border-slate-500 shadow-sm flex items-center justify-center">
        <span className="text-[#370505] font-black text-xl leading-none">H</span>
      </div>
      <h1 className="text-2xl font-bold tracking-wider text-white drop-shadow-md" style={{ textShadow: '1px 1px 2px black' }}>
        HUNGARAI <span className="text-xs font-normal text-slate-400 ml-1">Modulární UI</span>
      </h1>
    </div>
    
    <nav className="flex gap-2 bg-slate-950 p-1 border border-slate-700 shadow-inner">
      <button 
        onClick={() => setCurrentView('lessons')} 
        className={currentView === 'lessons' ? win7ButtonRed : win7ButtonWhite + " opacity-80"}
      >
        Lekce
      </button>
      <button 
        onClick={() => setCurrentView('vocabulary')} 
        className={currentView === 'vocabulary' ? win7ButtonWhite : win7ButtonWhite + " opacity-80"}
      >
        Slovník
      </button>
      <button 
        onClick={() => setCurrentView('stories')} 
        className={currentView === 'stories' ? win7ButtonGreen : win7ButtonWhite + " opacity-80"}
      >
        Příběhy
      </button>
    </nav>
  </header>

  {/* Hlavní obsahová část */}
  <main className="max-w-4xl mx-auto space-y-6">
    
    {/* Pohled: Lekce */}
    {currentView === 'lessons' && (
      <section className={`${win7Panel} p-6`}>
        <div className="border-b border-slate-600 shadow-[0_1px_0_rgba(255,255,255,0.05)] pb-3 mb-6 flex justify-between items-end">
          <h2 className="text-xl font-bold text-white drop-shadow-md">Výuková cesta</h2>
          <span className="text-xs text-slate-400 uppercase tracking-widest">Připraveno k propojení</span>
        </div>
        
        <div className="space-y-4">
          {/* Ukázkový placeholder pro lekci */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-600 p-4 flex justify-between items-center shadow-md relative overflow-hidden group hover:border-slate-400 transition-colors">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ce2939]"></div>
            <div className="pl-3">
              <h3 className="font-bold text-lg text-white mb-1">Lekce 1: První kroky</h3>
              <p className="text-sm text-slate-400">Čeká na načtení dat z lessons.json a vocabulary.json</p>
            </div>
            <button className={win7ButtonGreen}>Začít dril</button>
          </div>
        </div>
      </section>
    )}

    {/* Pohled: Slovník */}
    {currentView === 'vocabulary' && (
      <section className={`${win7Panel} p-6`}>
         <div className="border-b border-slate-600 shadow-[0_1px_0_rgba(255,255,255,0.05)] pb-3 mb-6">
          <h2 className="text-xl font-bold text-white drop-shadow-md">Databáze slov</h2>
        </div>
        <div className="bg-slate-950 border border-slate-700 p-8 text-center shadow-inner">
          <p className="text-slate-500 font-bold mb-4">Zatím nepropojeno</p>
          <p className="text-sm text-slate-600">Zde se vykreslí tabulka ze souboru vocabulary.json</p>
        </div>
      </section>
    )}

    {/* Pohled: Příběhy */}
    {currentView === 'stories' && (
      <section className={`${win7Panel} p-6`}>
         <div className="border-b border-slate-600 shadow-[0_1px_0_rgba(255,255,255,0.05)] pb-3 mb-6">
          <h2 className="text-xl font-bold text-white drop-shadow-md">Comprehensible Input (i+1)</h2>
        </div>
        <div className="bg-slate-950 border border-slate-700 p-8 text-center shadow-inner">
          <p className="text-slate-500 font-bold mb-4">Zatím nepropojeno</p>
          <p className="text-sm text-slate-600">Zde se načtou kontextové texty ze souboru stories.json</p>
        </div>
      </section>
    )}

  </main>
</div>


);
}
