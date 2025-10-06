import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smartmeet Admin - Signin",
  description: "This is Smartmeet Admin Signin Page",
};

export default function SignIn() {
  return <SignInForm />;
}
