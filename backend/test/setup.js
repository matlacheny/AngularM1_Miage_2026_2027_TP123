import { friendships } from "../src/friends.js";

/*
 * Mise en place commune des tests (importée en tête de chaque fichier) :
 * aucun test ne se connecte à MongoDB, donc la liste d'amis utilisée par les
 * règles de visibilité est remplacée par une doublure vide. Un test peut la
 * remplacer à son tour (stub(t, friendships, "idsOf", ...)).
 */
friendships.idsOf = async () => new Set();
friendships.between = async () => null;
