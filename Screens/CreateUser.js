import { StatusBar } from 'expo-status-bar';
import { Button, ImageBackground, StyleSheet, Text, TextInput, View, TouchableOpacity, Alert } from 'react-native';
import React, { useState } from 'react';
import firebase from '../config';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SERVER_TIMESTAMP, normalizePhone, syncOnlinePresence } from "../utils/appHelpers";

const database = firebase.database();
const ref_all_accounts = database.ref("Acounts");
const ref_public_profiles = database.ref("PublicProfiles");
const ref_phone_lookup = database.ref("PhoneLookup");

export default function CreateUser({ navigation }) {
  const auth = firebase.auth();
  const [fullName, setFullName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");

  // Handle Registration
  const handleRegister = async () => {
    const cleanFullName = fullName.trim();
    const cleanPseudo = pseudo.trim();
    const cleanEmail = email.trim();
    const cleanNumero = normalizePhone(numero);

    if (!cleanFullName || !cleanEmail || !pwd || !cleanPseudo) {
      Alert.alert("Missing info", "Please fill all required fields.");
      return;
    }
    if (pwd !== confPwd) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    let createdUser = null;
    let wroteAccount = false;
    let wrotePublic = false;
    let wrotePhone = false;

    try {
      // Create User in Firebase Authentication
      const cred = await auth.createUserWithEmailAndPassword(cleanEmail, pwd);
      createdUser = cred.user;
      const uid = createdUser.uid;

      // Check phone uniqueness before creating RTDB records
      if (cleanNumero.length > 0) {
        const existingPhone = await ref_phone_lookup.child(cleanNumero).once("value");
        if (existingPhone.exists() && existingPhone.val()?.uid !== uid) {
          throw new Error("This phone number is already associated with another account.");
        }
      }

      await ref_all_accounts.child(uid).set({
        Id: uid,
        FullName: cleanFullName,
        Pseudo: cleanPseudo,
        Numero: cleanNumero,
        Email: cleanEmail,
        online: true,
        lastSeen: SERVER_TIMESTAMP,
      });
      wroteAccount = true;

      await ref_public_profiles.child(uid).set({
        Id: uid,
        FullName: cleanFullName,
        Pseudo: cleanPseudo,
        online: true,
        lastSeen: SERVER_TIMESTAMP,
      });
      wrotePublic = true;

      if (cleanNumero.length > 0) {
        await ref_phone_lookup.child(cleanNumero).set({
          uid,
          FullName: cleanFullName,
          Pseudo: cleanPseudo,
        });
        wrotePhone = true;
      }

      await AsyncStorage.setItem("CURRENT_UID", uid);
      await syncOnlinePresence(database, uid);
      Alert.alert("Success", "Account created!");
      navigation.replace("Home", { currentid: uid });
    } catch (error) {
      // Best-effort rollback of partial creation so user can retry cleanly
      if (createdUser) {
        const uid = createdUser.uid;
        try {
          if (wrotePhone && cleanNumero.length > 0) await ref_phone_lookup.child(cleanNumero).remove();
          if (wrotePublic) await ref_public_profiles.child(uid).remove();
          if (wroteAccount) await ref_all_accounts.child(uid).remove();
          await createdUser.delete();
        } catch (rollbackErr) {
          console.warn("Registration rollback warning:", rollbackErr?.message || rollbackErr);
        }
      }
      Alert.alert("Error", error.message);
    }
  };

  return (
    <ImageBackground source={require("../assets/background.jpg")} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <TextInput style={styles.input} placeholder="Full Name" value={fullName} onChangeText={setFullName} />
        <TextInput style={styles.input} placeholder="Pseudo (Username)" value={pseudo} onChangeText={setPseudo} />
        <TextInput style={styles.input} placeholder="Phone Number" value={numero} onChangeText={setNumero} keyboardType="phone-pad" />
        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={pwd} onChangeText={setPwd} />
        <TextInput style={styles.input} placeholder="Confirm Password" secureTextEntry value={confPwd} onChangeText={setConfPwd} />

        <View style={styles.row}>
          <Button title="Register" color="#3b4db8" onPress={handleRegister} />
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Auth")}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="light" />
    </ImageBackground>
  );
}

// (styles: same as your original CreateUser.js)
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: "90%",
    padding: 25,
    backgroundColor: "#ffffffdd",
    borderRadius: 20,
    alignItems: "center",
    marginTop: 40
  },
  title: { fontSize: 30, fontWeight: "700", marginBottom: 15 },
  input: {
    width: "90%",
    backgroundColor: "#ececec",
    padding: 12,
    borderRadius: 10,
    marginVertical: 5
  },
  row: { marginTop: 20, width: "90%" },
  link: {
    marginTop: 15,
    color: "#1b2fbf",
    fontWeight: "600",
    textDecorationLine: "underline"
  },
});
