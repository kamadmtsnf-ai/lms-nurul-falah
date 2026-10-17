import "server-only";
import {requireAccount} from "./page-context";
export const requireActiveAccount=()=>requireAccount(true);
