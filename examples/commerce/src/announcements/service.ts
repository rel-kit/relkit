import { defineService } from "@relkit/app/services";
import getAnnouncements from "./functions/get-announcements.function.js";
import postAnnouncement from "./functions/post-announcement.function.js";

export default defineService({ functions: { getAnnouncements, postAnnouncement } });
