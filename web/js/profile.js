// /js/profile.js

async function loadProfile() {
  const user = await requireAuth();
  if (!user) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // PGRST116 = no rows found, lo tratamos como perfil vacío
  if (error && error.code !== "PGRST116") {
    console.error("Error cargando perfil:", error);
  }

  document.querySelector("#profile-email").textContent = user.email;
  document.querySelector("#profile-user-id").textContent = user.id;

  document.querySelector('input[name="full_name"]').value =
    data?.full_name || (user.user_metadata?.full_name ?? "");
  document.querySelector('input[name="phone"]').value = data?.phone || "";
  document.querySelector('input[name="headline"]').value = data?.headline || "";
  document.querySelector('textarea[name="bio"]').value = data?.bio || "";
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const form = e.target;
  const msgBox = "#profile-message";

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  const full_name = form.full_name.value.trim();
  const phone = form.phone.value.trim();
  const headline = form.headline.value.trim();
  const bio = form.bio.value.trim();

  const { error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      full_name,
      phone,
      headline,
      bio,
    });

  if (error) {
    console.error(error);
    showMessage(msgBox, "Error al guardar el perfil: " + error.message);
    return;
  }

  showMessage(msgBox, "Perfil guardado correctamente.", "success");
}

