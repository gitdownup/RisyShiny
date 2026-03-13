import React from 'react';
import { globalStyles } from 'src/GlobalStyles';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';

interface userData{
    user_email : string,
    user_password : string,
    login_timestamp : string
}

interface LoginScreenProps {
    onLogin: () => void;
    onGoToSignupScreen : () => void;
}

export default function LoginScreen({ onLogin, onGoToSignupScreen }: LoginScreenProps) {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const sendToDatabase = async (userData : userData) => {
        try {
            //TODO: Change the link to the PostgreSQL link
            const response = await fetch('https://link to change', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData),
            });

            const result = await response.json();
            console.log("Success:", result);
        } catch (error) {
            console.error("Error connecting to PostgreSQL:", error);
        }
    };

    const handleSubmit = () => {
        const userLoginData = {
            user_email: email,
            user_password: password,
            login_timestamp: new Date().toISOString()
        };

        sendToDatabase(userLoginData);
        onLogin();
    };

    return (
        <KeyboardAvoidingView
            style={globalStyles.appContainerCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={globalStyles.loginBox}>
                <Text style={globalStyles.titleText}>RisyShiny</Text>
                <Text style={globalStyles.headerText}>Login</Text>

                <View style={globalStyles.inputGroup}>
                    <Text style={globalStyles.label}>Email: </Text>
                    <TextInput
                        style={globalStyles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Enter your email"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                </View>

                <View style={globalStyles.inputGroup}>
                    <Text style={globalStyles.label}>Password: </Text>
                    <TextInput
                        style={globalStyles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter your password"
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity style={globalStyles.loginButton} onPress={handleSubmit}>
                    <Text style={globalStyles.buttonText}>Start game</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={globalStyles.loginButton} onPress={onGoToSignupScreen}>
                    <Text style={globalStyles.buttonText}>Don&#39;t have an account. Press here to sign up.</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}