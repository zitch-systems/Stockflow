// Inject clients to exercise authorization/retry boundaries without sending mail.
export function staffInviteHandler({ userClient, serviceClient, webOrigin }) {
  const allowedOrigins = new Set([webOrigin, 'capacitor://localhost', 'https://localhost', 'http://localhost']);
  return async function (request) {
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Vary':'Origin','Cache-Control':'no-store'};
    if(origin&&allowedOrigins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
    const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&!allowedOrigins.has(origin))return response({ok:false,error:'This origin is not enabled.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return response({ok:false,error:'Use POST.'},405);
    const authorization=request.headers.get('authorization')??'';
    if(!/^Bearer \S+$/.test(authorization)||authorization.length>12000)return response({ok:false,error:'Sign in again.'},401);
    let sideEffectStarted=false;
    try {
      const text=await request.text();
      if(text.length>8192)return response({ok:false,error:'Request is too large.'},413);
      let input;
      try { input=JSON.parse(text); } catch { return response({ok:false,error:'Check invitation details.'},400); }
      if(!input||typeof input!=='object'||!(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i).test(input.request_id??'')||!['manager','rep'].includes(input.role))return response({ok:false,error:'Check invitation details.'},400);
      const caller=userClient(authorization);
      const identity=await caller.auth.getUser();
      if(identity.error)return response({ok:false,error:'Could not verify your session. Retry the same invitation.'},identity.error.status&&identity.error.status<500?401:503);
      if(!identity.data.user)return response({ok:false,error:'Sign in again.'},401);
      const actor=identity.data.user.id;
      // Tenant/actor values in the HTTP body are deliberately ignored.
      const begin=await caller.rpc('stockflow_v2_begin_staff_invite',{p_request_id:input.request_id,p_email:input.email,p_full_name:input.full_name,p_phone:input.phone??null,p_role:input.role});
      if(begin.error)return response({ok:false,error:'Could not create this invitation. Check your access and details, then retry the same request.'},begin.error.code==='42501'?403:['P0001','23505','22P02','22023','PGRST202'].includes(begin.error.code)?400:503);
      const admin=serviceClient();
      const state=await admin.rpc('stockflow_v2_staff_invite_state',{p_actor_id:actor,p_request_id:input.request_id});
      if(state.error)return response({ok:false,error:'This invitation cannot be completed. Review existing staff or retry the same request.'},state.error.code==='42501'?403:state.error.code==='P0001'?409:503);
      if(!state.data?.payload)return response({ok:false,error:'The invitation result is unconfirmed. Retry the same details.'},503);
      if(state.data.result?.user_id)return response(state.data.result);
      let userId=state.data.user_id;
      if(!userId){
        sideEffectStarted=true;
        const invite=await admin.auth.admin.inviteUserByEmail(state.data.payload.email,{
          redirectTo:webOrigin+'/reset-password.html',
          data:{full_name:state.data.payload.full_name,phone:state.data.payload.phone,stockflow_request_id:input.request_id,stockflow_invited_by:actor},
        });
        if(invite.error||!invite.data.user)throw Error('Invitation result unconfirmed');
        userId=invite.data.user.id;
      }
      sideEffectStarted=true;
      const finish=await admin.rpc('stockflow_v2_finish_staff_invite',{p_actor_id:actor,p_request_id:input.request_id,p_user_id:userId});
      if(finish.error||!finish.data?.ok)throw Error('Provisioning result unconfirmed');
      return response(finish.data);
    } catch {
      return response({ok:false,error:sideEffectStarted?'Invitation result is unconfirmed. Retry the same details to recover it.':'Could not verify this request. Retry the same details.'},503);
    }
  };
}
