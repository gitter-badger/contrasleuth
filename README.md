# Contrasleuth

[![Join the chat at https://gitter.im/contrasleuth/community](https://badges.gitter.im/contrasleuth/community.svg)](https://gitter.im/contrasleuth/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Contrasleuth is a highly secure and distributed social network with a stellar user experience. Thanks to Contrasleuth's decentralized nature, Contrasleuth clients can automatically form networks with nearby devices and exchange information without the Internet.

Contrasleuth uses DHTs sparingly and prefers to broadcast messages. DHTs are notoriously hard to secure and unreliable, especially when MANETs (Mobile Ad-hoc Networks) are involved. Contrasleuth doesn't store messages and objects based on interest like IPFS and Secure Scuttlebutt as that reduces utility and introduces points of centralization.

Contrasleuth uses the excellent NaCl library _(technically libsodium, but whatever)_ for its cryptographic operations to avoid cryptography-related disasters that can impact the correct operation of Contrasleuth. Because Contrasleuth is a P2P network, it is easier to attack Contrasleuth than centralized social media platforms and therefore, cryptography is essential for Contrasleuth to work securely. But when a P2P network is augmented with cryptography, it enjoys much higher autonomy, security and reliability than what centralized services can offer.

Contrasleuth is more pleasant to use than traditional social networks. You can better control your privacy by creating separate identities to compartmentalize your online life. Also, Contrasleuth's automatic network formation feature enables you to use Contrasleuth without an Internet connection. It is so convenient.

To increase development velocity and security, Contrasleuth is mostly written in JavaScript (ES6+), a safe and performant interpreted programming language. Code to interact with the actual mobile hardware to form networks is still written in Java, though.

This project is MIT-licensed. We encourage you to play around with our code and build something amazing with Contrasleuth.
