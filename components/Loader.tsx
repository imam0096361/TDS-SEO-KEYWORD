
import React from 'react';

const messages = [
  "Analyzing competitor keywords...",
  "Scanning Bangladesh news media...",
  "Optimizing for Google AI Overviews...",
  "Crafting rank-worthy suggestions...",
  "Consulting SEO best practices...",
];

const Loader: React.FC = () => {
  const [message, setMessage] = React.useState(messages[0]);

  React.useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setMessage(messages[index]);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-brand-card/50 rounded-lg">
      <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-lg font-semibold text-brand-light">Generating Insights</p>
      <p className="text-sm text-gray-400 transition-opacity duration-500">{message}</p>
    </div>
  );
};

export default Loader;
