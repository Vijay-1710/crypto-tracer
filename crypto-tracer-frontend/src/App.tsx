import React from 'react';
import { InvestigationWorkbench } from './components/InvestigationWorkbench';

export const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <InvestigationWorkbench />
    </div>
  );
};

export default App;
