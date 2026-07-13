import { Component, Fragment } from "react";

/**
 * Catches render errors from one surface so a crashing tab doesn't take down
 * the whole app. A class component because React has no hook equivalent of
 * `getDerivedStateFromError`. "Try again" bumps the children's key, so the
 * failed subtree re-mounts from scratch instead of re-rendering into the same
 * broken state.
 */
export class ErrorBoundary extends Component<
  { label: string; children: React.ReactNode },
  { error: Error | null; resetKey: number }
> {
  constructor(props: { label: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  handleReset = () => {
    // oxlint-disable-next-line react/no-set-state -- boundaries must be class components; resetting one has no hook alternative
    this.setState((previous) => ({
      error: null,
      resetKey: previous.resetKey + 1,
    }));
  };

  override render() {
    const { error, resetKey } = this.state;

    if (error !== null) {
      return (
        <div className="flex flex-col items-start gap-2 p-4 text-sm">
          <p className="text-destructive">
            The {this.props.label} crashed: {error.message}
          </p>
          <button
            className="cursor-pointer rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
            onClick={this.handleReset}
            type="button"
          >
            Try again
          </button>
        </div>
      );
    }

    return <Fragment key={resetKey}>{this.props.children}</Fragment>;
  }
}
