'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, changePassword, getCurrentUser } from '@/app/actions/userAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, User, Key, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Password change state
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Check if already logged in
    useEffect(() => {
        getCurrentUser().then(user => {
            if (user && !user.force_password_change) {
                router.replace('/');
            }
        });
    }, [router]);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(username, password);

            if (result.success) {
                if (result.requiresPasswordChange) {
                    setShowPasswordChange(true);
                    setCurrentPassword(password); // Use entered password as current
                } else {
                    router.replace('/');
                }
            } else {
                setError(result.error || 'Login fehlgeschlagen');
            }
        } catch (e) {
            setError('Ein Fehler ist aufgetreten');
        } finally {
            setLoading(false);
        }
    }

    async function handlePasswordChange(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwörter stimmen nicht überein');
            return;
        }

        if (newPassword.length < 6) {
            setError('Passwort muss mindestens 6 Zeichen lang sein');
            return;
        }

        setLoading(true);

        try {
            const result = await changePassword(currentPassword, newPassword);

            if (result.success) {
                router.replace('/');
            } else {
                setError(result.error || 'Passwort ändern fehlgeschlagen');
            }
        } catch (e) {
            setError('Ein Fehler ist aufgetreten');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
            <Card className="w-full max-w-md border-muted/50 shadow-2xl">
                <CardHeader className="space-y-1 text-center pb-8">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Lock className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">
                        {showPasswordChange ? 'Passwort ändern' : 'Anmelden'}
                    </CardTitle>
                    <CardDescription>
                        {showPasswordChange
                            ? 'Sie müssen Ihr Passwort bei der ersten Anmeldung ändern'
                            : 'Melden Sie sich bei Reanimator an'
                        }
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && (
                        <div className="flex items-center gap-2 p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {!showPasswordChange ? (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username">Benutzername</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="admin"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="pl-10"
                                        required
                                        autoComplete="username"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Passwort</Label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10"
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>

                            <Button type="submit" className="w-full" size="lg" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Anmelden
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">Neues Passwort</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    placeholder="Mindestens 6 Zeichen"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="Passwort wiederholen"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                            </div>

                            <Button type="submit" className="w-full" size="lg" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Passwort ändern
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
