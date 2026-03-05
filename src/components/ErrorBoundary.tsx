"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary — catches unhandled errors in any child component tree.
 * 
 * Must be a class component (React limitation for error boundaries).
 * Displays a PRISM-styled error screen with recovery options.
 */
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[PRISM Error Boundary]", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    handleHome = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = "/";
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[60vh]">
                    <div className="w-full max-w-lg text-center space-y-6">
                        {/* Icon */}
                        <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 rounded-full bg-red-400/10 border border-red-400/20" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <AlertTriangle className="w-10 h-10 text-red-400" />
                            </div>
                        </div>

                        {/* Message */}
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
                            <p className="text-sm text-prism-muted">
                                An unexpected error occurred in the PRISM interface. Your data is safe.
                            </p>
                        </div>

                        {/* Error details */}
                        {this.state.error && (
                            <div className="glass-panel rounded-xl p-4 text-left">
                                <p className="text-xs font-mono text-red-400/80 break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-prism-sky text-prism-bg hover:bg-white transition-all duration-300"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Try Again
                            </button>
                            <button
                                onClick={this.handleHome}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm text-prism-muted border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                            >
                                <Home className="w-4 h-4" />
                                Return Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
