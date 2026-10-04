import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorsProxySetting } from './CorsProxySetting';

describe('CorsProxySetting', () => {
  it('loads and saves the proxy', async () => {
    localStorage.setItem('cors_proxy', JSON.stringify('https://old.com/'));
    render(<CorsProxySetting />);
    const input = screen.getByLabelText('RSS CORS Proxy');
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('https://old.com/'));
    await userEvent.clear(input);
    await userEvent.type(input, 'https://p.com/?url={{url}{enter}');
    expect(JSON.parse(localStorage.getItem('cors_proxy') ?? '""')).toBe('https://p.com/?url={url}');
  });
});
