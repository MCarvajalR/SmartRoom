import bcrypt

class Hasher:
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        Verifica si la contraseña en texto plano coincide con el hash almacenado.
        """
        # Bcrypt requiere que los datos sean bytes
        password_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)

    @staticmethod
    def get_password_hash(password: str) -> str:
        """
        Genera un hash seguro a partir de una contraseña en texto plano.
        """
        # 1. Convertir la contraseña a bytes
        password_bytes = password.encode('utf-8')
        # 2. Generar una sal (salt)
        salt = bcrypt.gensalt()
        # 3. Generar el hash
        hashed = bcrypt.hashpw(password_bytes, salt)
        # 4. Devolver como string para poder guardarlo en la base de datos
        return hashed.decode('utf-8')