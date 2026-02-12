import React, { ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

interface ErrorBoundaryProps {
  // Make children optional to handle strict type checking where implicit children passing might be flagged
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error Boundary Component to catch runtime errors
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  // Explicitly declare props to fix TS error where it thinks props does not exist on the class
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error: error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full text-left">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
            <p className="text-slate-700 mb-2">
              The application encountered a critical error and could not start.
            </p>
            <p className="text-slate-600 mb-4">
              This often happens if the application is not configured correctly. A common issue is that the necessary API key is not available to the application. Please check your browser's developer console (usually F12) for specific error messages. An error like <code className="bg-slate-200 p-1 rounded text-sm font-mono">ReferenceError: process is not defined</code> indicates this configuration problem.
            </p>
            <div className="bg-red-50 p-4 rounded-md text-red-800 overflow-auto mt-6">
              <h2 className="font-semibold mb-2">Error Details:</h2>
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {this.state.error && this.state.error.toString()}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);