/**
 * Shared shell bootstrap for static content and legal pages.
 */
import { mountShell } from "../ui.js?v=20261102f";

mountShell({ active: document.body.dataset.page || "" });
