import React from 'react';
import { globalStyles } from 'src/GlobalStyles';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';

interface UserData{
    user_email : string,
    user_password : string,
    login_timestamp : string
}

export default function SignupScreen({ onGoToLoginScreen }: { onGoToLoginScreen: () => void }) {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    const sendToDatabase = async (UserData : UserData) => {
        try {
            //TODO: Change the link to the PostgreSQL link
            const response = await fetch('https://link to change', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(UserData),
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
        onGoToLoginScreen();
    };

    return (
        <KeyboardAvoidingView
            style={globalStyles.appContainerCentered}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={globalStyles.loginBox}>
                <Text style={globalStyles.titleText}>RisyShiny</Text>
                <Text style={globalStyles.headerText}>Signup</Text>

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
            </View>
        </KeyboardAvoidingView>
    );
}