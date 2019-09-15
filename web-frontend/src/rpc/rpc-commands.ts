import axios from "./unix-socket-axios";

export const createIdentity = (name: string) =>
  axios.post("/create-identity", { name });

export const handleIdentity = (id: string) => ({
  rename: (name: string) => axios.post(`/${id}/rename`, { name }),
  delete: () => axios.post(`/${id}/delete`),
  createUnmoderatedGroup: (name: string) =>
    axios.post(`/${id}/create-unmoderated-group`, { name }),
  joinUnmoderatedGroup: (name: string, key: number[]) =>
    axios.post(`/${id}/join-unmoderated-group`, { name, key }),
  renameUnmoderatedGroup: (name: string, key: number[]) =>
    axios.post(`/${id}/rename-unmoderated-group`, { name, key }),
  leaveUnmoderatedGroup: (key: number[]) =>
    axios.post(`/${id}/leave-unmoderated-group`, { key }),
  createPostInUnmoderatedGroup: (
    content: string,
    key: number[],
    timeToLive: number
  ) =>
    axios.post(`/${id}/create-post-in-unmoderated-group`, {
      content,
      key,
      timeToLive
    }),
  addContact: (
    name: string,
    publicSigningKey: number[],
    publicEncryptionKey: number[]
  ) =>
    axios.post(`/${id}/add-contact`, {
      name,
      publicSigningKey,
      publicEncryptionKey
    }),
  editContact: (
    contactID: string,
    name: string,
    publicSigningKey: number[],
    publicEncryptionKey: number[]
  ) =>
    axios.post(`/${id}/edit-contact`, {
      id: contactID,
      name,
      publicSigningKey,
      publicEncryptionKey
    }),
  deleteContact: (contactID: string) =>
    axios.post(`/${id}/delete-contact`, {
      id: contactID
    }),
  sendAsymmetricallyEncryptedMessage: (
    content: string,
    publicEncryptionKey: number[],
    publicSigningKey: number[],
    timeToLive: number
  ) =>
    axios.post(`/${id}/send-asymmetrically-encrypted-message`, {
      content,
      publicSigningKey,
      publicEncryptionKey,
      timeToLive
    })
});
