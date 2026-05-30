import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;

export type AuthSession = {
  idToken: string;
  accessToken: string;
  email: string;
  userId: string;
};

function getUserPool(): CognitoUserPool {
  if (!userPoolId || !clientId) {
    throw new Error("Missing Cognito configuration in VITE_COGNITO_USER_POOL_ID/VITE_COGNITO_CLIENT_ID");
  }

  return new CognitoUserPool({
    UserPoolId: userPoolId,
    ClientId: clientId,
  });
}

export function signIn(email: string, password: string): Promise<AuthSession> {
  const userPool = getUserPool();
  const user = new CognitoUser({ Username: email, Pool: userPool });
  const auth = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(auth, {
      onSuccess: (session: CognitoUserSession) => {
        const idToken = session.getIdToken();
        resolve({
          idToken: idToken.getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          email,
          userId: idToken.payload.sub as string,
        });
      },
      onFailure: reject,
    });
  });
}

export function signUp(email: string, password: string): Promise<void> {
  const userPool = getUserPool();
  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, [], [], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
