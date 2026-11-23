import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { MarkdownContent } from '../components/ui/MarkdownContent';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS: string[] = [
  'What should I restock this week?',
  'Which products are overstocked?',
  'Which category will earn the most profit next month?',
  'Why is stock-out risk high for my top products?',
];

export const AiAssistantPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendQuestion = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    setErrorMsg(null);
    const userMessage: ChatMessage = {
      id: `${Date.now()}_user`,
      role: 'user',
      content: trimmed,
    };

    // Keep last few messages for context
    const historyToSend = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          question: trimmed,
          history: historyToSend,
        },
      });

      if (error) {
        let friendlyMessage =
          'Could not get a response from the AI Assistant right now.';
        try {
          if (
            'context' in error &&
            error.context &&
            typeof (error.context as Response).json === 'function'
          ) {
            const errJson = await (error.context as Response).json();
            if (errJson?.error) {
              friendlyMessage = errJson.error;
            }
          } else if (error.message) {
            friendlyMessage = error.message;
          }
        } catch {
          // Keep default friendly fallback
        }
        setErrorMsg(friendlyMessage);
        setLoading(false);
        return;
      }

      if (data?.error) {
        setErrorMsg(data.error);
        setLoading(false);
        return;
      }

      const answer = (data?.answer || '').trim();
      if (!answer) {
        setErrorMsg('The AI Assistant returned an empty response.');
        setLoading(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}_assistant`,
          role: 'assistant',
          content: answer,
        },
      ]);
    } catch {
      setErrorMsg(
        'Failed to reach the AI Assistant Edge Function. Please check your connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(question);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1 className="text-headline-sm">AI Assistant</h1>
        <p
          className="text-body-sm"
          style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
        >
          Ask questions about your supermarket stock, restocking priorities,
          and RWF profit forecasts. All answers use only verified server numbers.
        </p>
      </div>

      {/* 4 Suggested Question Chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}
      >
        <span
          className="text-label-sm"
          style={{ color: 'var(--color-secondary)', marginRight: '4px' }}
        >
          Suggested questions:
        </span>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(q)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Chip variant="active">{q}</Chip>
          </button>
        ))}
      </div>

      {/* Chat Conversation Panel */}
      <Card
        style={{
          padding: 'var(--space-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-md)',
          minHeight: '420px',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
            maxHeight: '520px',
            overflowY: 'auto',
          }}
        >
          {messages.length === 0 && !loading ? (
            <div
              style={{
                padding: 'var(--space-lg) var(--space-md)',
                textAlign: 'center',
                color: 'var(--color-secondary)',
              }}
            >
              <Sparkles
                size={24}
                color="var(--color-primary)"
                style={{ marginBottom: '8px' }}
              />
              <div
                className="text-label-lg"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Ask about inventory, alerts, or RWF profit projections
              </div>
              <p
                className="text-body-sm"
                style={{ marginTop: '4px', maxWidth: '480px', marginInline: 'auto' }}
              >
                Click one of the suggested question chips above or type your own
                question below.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    backgroundColor: isUser
                      ? 'var(--color-primary-20)'
                      : 'var(--color-surface)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    className="text-label-sm"
                    style={{
                      color: isUser
                        ? 'var(--color-primary)'
                        : 'var(--color-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    {isUser ? 'You (Manager)' : 'AI Inventory Analyst'}
                  </div>
                  <div className="text-body-sm">
                    {isUser ? (
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '22px' }}>
                        {msg.content}
                      </div>
                    ) : (
                      <MarkdownContent content={msg.content} />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
                color: 'var(--color-secondary)',
              }}
              className="text-body-sm"
            >
              Analyzing verified supermarket forecast and inventory data...
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xs)',
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-sm)',
          }}
        >
          {errorMsg && (
            <div
              className="text-body-sm"
              style={{
                color: 'var(--color-error)',
                backgroundColor: '#FCECEC',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {errorMsg}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
            }}
          >
            <Input
              id="assistant-question"
              placeholder="Ask a question about restocking, overstock, or RWF profit..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              aria-label="Ask the AI Assistant"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !question.trim()}
            >
              <Send size={15} />
              {loading ? 'Thinking...' : 'Send'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

