import {View,Text,TextInput,TouchableOpacity,StyleSheet,ImageBackground,Alert,Modal, ActivityIndicator,} from "react-native";
import React, { useState, useEffect, useRef } from "react";
import firebase from "../config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncOnlinePresence } from "../utils/appHelpers";

export default function Auth({ navigation }) {
  const auth = firebase.auth();
  const database = firebase.database();

  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const hasNavigatedRef = useRef(false);

  const completeAuthenticatedSession = async (user) => {
    if (!user || hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    const uid = user.uid;

    try {
      await AsyncStorage.setItem("CURRENT_UID", uid);
    } catch (storageErr) {
      console.warn("AsyncStorage set CURRENT_UID failed:", storageErr?.message || storageErr);
    }

    try {
      await syncOnlinePresence(database, uid);
    } catch (presenceErr) {
      console.warn("Presence sync failed:", presenceErr?.message || presenceErr);
    }

    navigation.replace("Home", { currentid: uid });
  };

  // Restore Firebase Auth session securely instead of trusting AsyncStorage alone
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await completeAuthenticatedSession(user);
      } else {
        try {
          await AsyncStorage.removeItem("CURRENT_UID");
        } catch (_) {}
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Login function
  const handleLogin = async () => {
    if (!email || !pwd) {
      Alert.alert("Missing info", "Please enter email and password.");
      return;
    }

    try {
      const userCredential = await auth.signInWithEmailAndPassword(
        email.trim(),
        pwd
      );

      await completeAuthenticatedSession(userCredential.user);
    } catch (error) {
      Alert.alert("Login Error", error.message);
    }
  };

  // Forgot password modal
  const openForgotModal = () => {
    setResetEmail(email);
    setModalVisible(true);
  };

  const handleSendReset = async () => {
    if (!resetEmail) {
      Alert.alert("Error", "Please enter your email.");
      return;
    }

    try {
      await auth.sendPasswordResetEmail(resetEmail.trim());
      setModalVisible(false);

      Alert.alert("Email sent", "Check your inbox to reset password.");
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  // Loading indicator while checking Firebase Auth session
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#200ae1ff" />
        <Text style={{ marginTop: 10 }}>Checking login status...</Text>
      </View>
    );
  }
 
  return (
    <ImageBackground
      source={require("../assets/background.jpg")}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome Back</Text>

        <TextInput
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          placeholder="Password"
          style={styles.input}
          secureTextEntry
          value={pwd}
          onChangeText={setPwd}
        />

        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.loginText}>Login</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openForgotModal}>
          <Text style={styles.forgetPwd}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("CreateUser")}>
          <Text style={styles.link}>Don't have an account? Create one</Text>
        </TouchableOpacity>
      </View>

      {/* Reset password modal */}
      
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalDesc}>
              Enter your email to receive reset link.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter your email"
              value={resetEmail}
              onChangeText={setResetEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendReset} style={styles.sendBtn}>
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    width: "90%",
    padding: 25,
    backgroundColor: "#ffffffdd",
    borderRadius: 20,
    alignItems: "center",
    marginTop: 50,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 20,
  },

  input: {
    width: "90%",
    backgroundColor: "#ececec",
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
  },

  loginBtn: {
    marginTop: 20,
    width: "90%",
    padding: 14,
    backgroundColor: "#3b4db8",
    borderRadius: 12,
    alignItems: "center",
  },

  loginText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  forgetPwd: {
    marginTop: 15,
    color: "#d9534f",
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  link: {
    marginTop: 15,
    color: "#1b2fbf",
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  modalCard: {
    width: "85%",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },

  modalDesc: {
    fontSize: 14,
    color: "#666",
    marginBottom: 15,
  },

  modalInput: {
    width: "100%",
    backgroundColor: "#f0f0f0",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },

  cancelBtn: {
    flex: 1,
    padding: 10,
    marginRight: 10,
    alignItems: "center",
  },

  cancelText: {
    color: "gray",
    fontWeight: "bold",
  },

  sendBtn: {
    flex: 1,
    backgroundColor: "#3b4db8",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },

  sendText: {
    color: "white",
    fontWeight: "bold",
  },
});
