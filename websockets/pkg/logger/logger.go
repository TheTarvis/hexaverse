package logger

import (
	"context"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func Init() {

	// Use pretty console logging for development, JSON for production
	if os.Getenv("ENV") == "production" {
		// Configure zerolog for Google Cloud Run
		log.Logger = zerolog.New(os.Stdout).
			With().
			Timestamp().
			Str("severity", "DEBUG"). // Default severity level
			Logger().
			Hook(severityHook{})
	} else {
		// Set global log level to info to save money. Change locally if wanted.
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: "2006-01-02T15:04:05.000Z07:00",
		})
	}
}

// WithContext returns a context with logger
func WithContext(ctx context.Context) context.Context {
	return log.Logger.WithContext(ctx)
}

// severityHook implements zerolog.Hook to add proper severity levels for Google Cloud Run
type severityHook struct{}

func (h severityHook) Run(e *zerolog.Event, level zerolog.Level, msg string) {
	if level != zerolog.NoLevel {
		levelStr := "INFO" // Default to INFO
		switch level {
		case zerolog.DebugLevel:
			levelStr = "DEBUG"
		case zerolog.InfoLevel:
			levelStr = "INFO"
		case zerolog.WarnLevel:
			levelStr = "WARNING"
		case zerolog.ErrorLevel:
			levelStr = "ERROR"
		case zerolog.FatalLevel:
			levelStr = "CRITICAL"
		case zerolog.PanicLevel:
			levelStr = "CRITICAL"
		}
		e.Str("severity", levelStr)
	}
}
