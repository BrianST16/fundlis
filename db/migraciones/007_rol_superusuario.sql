/* =====================================================================
   007 - Rol SUPERUSUARIO (mantenimiento)
   ---------------------------------------------------------------------
   Motivo: correcciones 2 y 3 (D-45). Se agrega un rol con acceso total,
   unico que puede otorgar o quitar ADMINISTRADOR. Nunca se asigna desde
   la interfaz ni desde la API: solo con db/scripts/asignar_superusuario.sql.
   Cambio no destructivo: solo amplia la lista del CHECK.
   ===================================================================== */
ALTER TABLE USUARIO_ROL DROP CONSTRAINT CK_USUARIO_ROL_rol;
GO
ALTER TABLE USUARIO_ROL ADD CONSTRAINT CK_USUARIO_ROL_rol
    CHECK (rol IN ('AUXILIAR_LIS','ADMINISTRADOR','SUPERUSUARIO'));
GO
